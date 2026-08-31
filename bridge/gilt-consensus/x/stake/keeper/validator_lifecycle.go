package keeper

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdkmath "cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	sdk "github.com/cosmos/cosmos-sdk/types"
	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"

	util "github.com/giltchain/gilt-consensus/common/hex"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/giltchain/gilt-consensus/x/stake/types"
)

func (k Keeper) SetValidatorLifecycleParams(ctx context.Context, params types.ValidatorLifecycleParams) error {
	k.PanicIfSetupIsIncomplete()
	params.NormalizeDefaults()
	if err := params.ValidateBasic(); err != nil {
		return err
	}
	return k.validatorLifecycleParams.Set(ctx, params)
}

func (k Keeper) GetValidatorLifecycleParams(ctx context.Context) (types.ValidatorLifecycleParams, error) {
	k.PanicIfSetupIsIncomplete()
	params, err := k.validatorLifecycleParams.Get(ctx)
	if err == nil {
		params.NormalizeDefaults()
		return params, nil
	}
	if errors.Is(err, collections.ErrNotFound) {
		params = types.DefaultValidatorLifecycleParams()
		return params, nil
	}
	return types.ValidatorLifecycleParams{}, err
}

func (k Keeper) SetValidatorApproval(ctx context.Context, approval types.ValidatorApproval) error {
	if err := k.setValidatorApprovalRecord(ctx, approval); err != nil {
		return err
	}
	return k.validatorApprovalDone.Set(ctx, approval.ValId, true)
}

func (k Keeper) setValidatorApprovalRecord(ctx context.Context, approval types.ValidatorApproval) error {
	k.PanicIfSetupIsIncomplete()
	approval.Normalize()
	if err := approval.ValidateBasic(); err != nil {
		return err
	}
	return k.validatorApprovals.Set(ctx, approval.ValId, approval)
}

func (k Keeper) GetValidatorApproval(ctx context.Context, valID uint64) (types.ValidatorApproval, error) {
	k.PanicIfSetupIsIncomplete()
	approval, err := k.validatorApprovals.Get(ctx, valID)
	if err != nil {
		return types.ValidatorApproval{}, err
	}
	approval.Normalize()
	return approval, nil
}

func (k Keeper) GetAllValidatorApprovals(ctx context.Context) ([]types.ValidatorApproval, error) {
	k.PanicIfSetupIsIncomplete()
	iterator, err := k.validatorApprovals.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := iterator.Close(); err != nil {
			k.Logger(ctx).Error("Error closing validator approval iterator", "error", err)
		}
	}()

	approvals := make([]types.ValidatorApproval, 0)
	for ; iterator.Valid(); iterator.Next() {
		approval, err := iterator.Value()
		if err != nil {
			return nil, err
		}
		approval.Normalize()
		approvals = append(approvals, approval)
	}
	return approvals, nil
}

func (k Keeper) IsValidatorApprovalFinalized(ctx context.Context, valID uint64) (bool, error) {
	k.PanicIfSetupIsIncomplete()
	finalized, err := k.validatorApprovalDone.Get(ctx, valID)
	if err == nil {
		return finalized, nil
	}
	if errors.Is(err, collections.ErrNotFound) {
		// Backward compatibility for pre-vote-chain state where approvals had no explicit finalization flag.
		if _, approvalErr := k.GetValidatorApproval(ctx, valID); approvalErr == nil {
			return true, nil
		} else if errors.Is(approvalErr, collections.ErrNotFound) {
			return false, approvalErr
		} else {
			return false, approvalErr
		}
	}
	return false, err
}

func (k Keeper) GetValidatorApprovalVoteStatus(ctx context.Context, valID uint64) (yesPower uint64, totalPower uint64, finalized bool, err error) {
	k.PanicIfSetupIsIncomplete()

	finalized, err = k.IsValidatorApprovalFinalized(ctx, valID)
	if err != nil {
		return 0, 0, false, err
	}

	totalPower, err = k.validatorApprovalTotal.Get(ctx, valID)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return 0, 0, false, err
	}
	if errors.Is(err, collections.ErrNotFound) {
		totalPower = 0
	}

	yesPower, err = k.validatorApprovalYes.Get(ctx, valID)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return 0, 0, false, err
	}
	if errors.Is(err, collections.ErrNotFound) {
		yesPower = 0
	}

	if totalPower > 0 && yesPower > totalPower {
		return 0, 0, false, errorsmod.Wrap(types.ErrInvalidMsg, "approval yes voting power exceeds total voting power")
	}

	return yesPower, totalPower, finalized, nil
}

func (k *Keeper) rejectNativeStakeWrite() error {
	return errorsmod.Wrap(types.ErrNativeStakeRetired, "native bank stake cannot write validator power")
}

func (k *Keeper) ApproveValidator(ctx context.Context, msg *types.MsgApproveValidator) error {
	k.PanicIfSetupIsIncomplete()
	if err := k.rejectNativeStakeWrite(); err != nil {
		return err
	}
	if err := msg.ValidateBasic(); err != nil {
		return err
	}

	existing, err := k.GetValidatorApproval(ctx, msg.ValId)
	hasExisting := err == nil
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return err
	}

	var existingFinalized bool
	if hasExisting {
		existingFinalized, err = k.IsValidatorApprovalFinalized(ctx, msg.ValId)
		if err != nil {
			return err
		}
	}

	isNewProposal := false
	switch {
	case !hasExisting:
		if msg.Nonce == 0 {
			return errorsmod.Wrap(types.ErrInvalidMsg, "approval nonce must be positive")
		}
		isNewProposal = true
	case msg.Nonce == existing.Nonce:
		if existingFinalized {
			return errorsmod.Wrapf(types.ErrInvalidMsg, "approval nonce %d already finalized, expected %d", msg.Nonce, existing.Nonce+1)
		}
		if !approvalMatchesMsg(existing, msg) {
			return errorsmod.Wrap(types.ErrInvalidMsg, "approval vote payload does not match existing pending proposal")
		}
	case msg.Nonce == existing.Nonce+1:
		if !existingFinalized {
			return errorsmod.Wrapf(types.ErrInvalidMsg, "approval nonce %d is still pending and not finalized", existing.Nonce)
		}
		isNewProposal = true
	default:
		expected := existing.Nonce
		if existingFinalized {
			expected = existing.Nonce + 1
		}
		return errorsmod.Wrapf(types.ErrInvalidMsg, "invalid approval nonce %d, expected %d", msg.Nonce, expected)
	}

	if validator, err := k.GetValidatorFromValID(ctx, msg.ValId); err == nil {
		if util.FormatAddress(msg.Operator) != validator.OperatorAddress() {
			return errorsmod.Wrap(types.ErrInvalidMsg, "active validator approval cannot change operator")
		}
		if isNewProposal && util.FormatAddress(msg.From) != validator.OperatorAddress() {
			return errorsmod.Wrap(sdkerrors.ErrUnauthorized, "only the validator operator can propose updates for an existing validator")
		}
	} else if !errors.Is(err, collections.ErrNotFound) {
		return err
	}

	if isNewProposal {
		if _, err := k.validatorByOperatorInCurrentSet(ctx, msg.From); err != nil {
			return err
		}
		if err := k.ensureOperatorUniqueForApprovalProposal(ctx, msg.Operator, msg.ValId); err != nil {
			return err
		}
	}

	if isNewProposal {
		approval := types.ValidatorApproval{
			ValId:           msg.ValId,
			Operator:        msg.Operator,
			ActivationEpoch: msg.ActivationEpoch,
			MaxGiltStake:    msg.MaxGiltStake,
			SignerPubKey:    msg.SignerPubKey,
			Nonce:           msg.Nonce,
		}
		if err := k.setValidatorApprovalRecord(ctx, approval); err != nil {
			return err
		}
		if err := k.initializeApprovalVoteSnapshot(ctx, approval); err != nil {
			return err
		}
	}

	voterValID, err := k.snapshotVoterValIDForOperator(ctx, msg.ValId, msg.Nonce, msg.From)
	if err != nil {
		return err
	}

	voteKey := nativeApprovalVoteKey(msg.ValId, msg.Nonce, voterValID)
	if exists, err := k.validatorApprovalVotes.Has(ctx, voteKey); err != nil {
		return err
	} else if exists {
		return errorsmod.Wrap(sdkerrors.ErrConflict, "validator already voted for this approval proposal")
	}

	voterPower, err := k.validatorApprovalPowers.Get(ctx, voteKey)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return errorsmod.Wrap(sdkerrors.ErrUnauthorized, "validator is not eligible in this approval snapshot")
		}
		return err
	}
	if voterPower == 0 {
		return errorsmod.Wrap(types.ErrInvalidMsg, "validator snapshot voting power must be positive")
	}

	if err := k.validatorApprovalVotes.Set(ctx, voteKey, true); err != nil {
		return err
	}

	yesPower, err := k.validatorApprovalYes.Get(ctx, msg.ValId)
	if err != nil {
		return err
	}
	yesPower += voterPower
	if err := k.validatorApprovalYes.Set(ctx, msg.ValId, yesPower); err != nil {
		return err
	}

	totalPower, err := k.validatorApprovalTotal.Get(ctx, msg.ValId)
	if err != nil {
		return err
	}
	if totalPower == 0 {
		return errorsmod.Wrap(types.ErrInvalidMsg, "approval snapshot total voting power must be positive")
	}

	yes := sdkmath.NewIntFromUint64(yesPower)
	total := sdkmath.NewIntFromUint64(totalPower)
	finalized := yes.MulRaw(3).GT(total.MulRaw(2))
	if err := k.validatorApprovalDone.Set(ctx, msg.ValId, finalized); err != nil {
		return err
	}

	return k.setNativeLifecycleSequence(ctx, fmt.Sprintf("approve-validator-vote/%d", voterValID), msg.ValId, msg.Nonce)
}

func (k *Keeper) JoinValidator(ctx context.Context, msg *types.MsgValidatorJoin) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.rejectNativeStakeWrite(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	if ok, err := k.DoesValIdExist(ctx, msg.ValId); err != nil {
		return types.Validator{}, err
	} else if ok {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, "validator id already exists")
	}

	approval, err := k.requireFinalizedValidatorApproval(ctx, msg.ValId, "validator is not approved", "validator approval is pending 2/3 vote finalization")
	if err != nil {
		return types.Validator{}, err
	}
	if util.FormatAddress(msg.From) != util.FormatAddress(approval.Operator) {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrUnauthorized, "validator join must be submitted by approved operator")
	}
	if msg.ActivationEpoch != approval.ActivationEpoch {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator activation epoch does not match approval")
	}
	if !bytes.Equal(msg.SignerPubKey, approval.SignerPubKey) {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator signer public key does not match approval")
	}
	if msg.Nonce != approval.Nonce {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator join nonce must match approval nonce")
	}
	if msg.Amount.GT(approval.MaxGiltStake) {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator GILT stake exceeds approved cap")
	}
	if err := k.ensureOperatorUniqueForApprovalProposal(ctx, approval.Operator, msg.ValId); err != nil {
		return types.Validator{}, err
	}

	pubKey := secp256k1.PubKey{Key: msg.SignerPubKey}
	if pubKey.Type() != types.Secp256k1Type {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, "validator signer public key is invalid")
	}
	signer := util.FormatAddress(pubKey.Address().String())
	if existing, err := k.GetValidatorInfo(ctx, signer); err == nil && existing.ValId != 0 {
		return types.Validator{}, errorsmod.Wrapf(sdkerrors.ErrInvalidRequest, "validator signer %s already exists", signer)
	}

	power, err := validatorPowerFromGilt(msg.Amount)
	if err != nil {
		return types.Validator{}, err
	}

	validator := types.Validator{
		ValId:                 msg.ValId,
		StartEpoch:            msg.ActivationEpoch,
		EndEpoch:              0,
		Nonce:                 msg.Nonce,
		VotingPower:           power,
		PubKey:                pubKey.Bytes(),
		Signer:                signer,
		Operator:              util.FormatAddress(msg.From),
		LastUpdated:           nativeLifecycleSequence("validator-join", msg.ValId, msg.Nonce),
		SelfGiltStake:         msg.Amount,
		DelegatedGiltStake:    sdkmath.ZeroInt(),
		DelegatedGoldStake:    sdkmath.ZeroInt(),
		EffectiveRewardWeight: sdkmath.ZeroInt(),
		LastGiltPriceInGold:   sdkmath.ZeroInt(),
	}
	validator.NormalizeLifecycleAccounting()

	if err := k.validateValidatorSetSafety(ctx, &validator, msg.ActivationEpoch); err != nil {
		return types.Validator{}, err
	}

	operatorAddr, _, err := parseDelegator(msg.From)
	if err != nil {
		return types.Validator{}, err
	}
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, operatorAddr, types.ModuleName, sdk.NewCoins(sdk.NewCoin(types.GiltDenom, msg.Amount))); err != nil {
		return types.Validator{}, err
	}

	if err := k.RefreshValidatorRewardWeight(ctx, &validator); err != nil {
		return types.Validator{}, err
	}
	if err := k.AddValidator(ctx, validator); err != nil {
		return types.Validator{}, err
	}
	if err := k.setNativeLifecycleSequence(ctx, "validator-join", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return validator, nil
}

func (k *Keeper) IncreaseValidatorStake(ctx context.Context, msg *types.MsgStakeUpdate) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.rejectNativeStakeWrite(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.GetValidatorFromValID(ctx, msg.ValId)
	if err != nil {
		return types.Validator{}, err
	}
	if err := requireValidatorOperator(msg.From, validator); err != nil {
		return types.Validator{}, err
	}
	if msg.Nonce != validator.Nonce+1 {
		return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "invalid validator nonce %d, expected %d", msg.Nonce, validator.Nonce+1)
	}
	if !msg.NewAmount.GT(validator.SelfGiltStake) {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "stake update can only increase validator self-staked GILT")
	}
	approval, err := k.requireFinalizedValidatorApproval(ctx, msg.ValId, "validator stake cap approval is missing", "validator stake cap approval is pending 2/3 vote finalization")
	if err != nil {
		return types.Validator{}, err
	}
	if msg.NewAmount.GT(approval.MaxGiltStake) {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator GILT stake exceeds approved cap")
	}

	power, err := validatorPowerFromGilt(msg.NewAmount)
	if err != nil {
		return types.Validator{}, err
	}
	updated := validator
	updated.SelfGiltStake = msg.NewAmount
	updated.VotingPower = power
	updated.Nonce = msg.Nonce
	updated.LastUpdated = nativeLifecycleSequence("stake-update", msg.ValId, msg.Nonce)
	updated.NormalizeLifecycleAccounting()

	epoch, err := k.currentRewardEpoch(ctx)
	if err != nil {
		return types.Validator{}, err
	}
	if updated.StartEpoch > epoch {
		epoch = updated.StartEpoch
	}
	if err := k.validateValidatorSetSafety(ctx, &updated, epoch); err != nil {
		return types.Validator{}, err
	}

	diff := msg.NewAmount.Sub(validator.SelfGiltStake)
	operatorAddr, _, err := parseDelegator(msg.From)
	if err != nil {
		return types.Validator{}, err
	}
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, operatorAddr, types.ModuleName, sdk.NewCoins(sdk.NewCoin(types.GiltDenom, diff))); err != nil {
		return types.Validator{}, err
	}

	if err := k.RefreshValidatorRewardWeight(ctx, &updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.AddValidator(ctx, updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.setNativeLifecycleSequence(ctx, "stake-update", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return updated, nil
}

func (k *Keeper) UpdateValidatorSigner(ctx context.Context, msg *types.MsgSignerUpdate) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.rejectNativeStakeWrite(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.GetValidatorFromValID(ctx, msg.ValId)
	if err != nil {
		return types.Validator{}, err
	}
	if err := requireValidatorOperator(msg.From, validator); err != nil {
		return types.Validator{}, err
	}
	if msg.Nonce != validator.Nonce+1 {
		return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "invalid validator nonce %d, expected %d", msg.Nonce, validator.Nonce+1)
	}

	pubKey := secp256k1.PubKey{Key: msg.NewSignerPubKey}
	if pubKey.Type() != types.Secp256k1Type {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, "new signer public key is invalid")
	}
	newSigner := util.FormatAddress(pubKey.Address().String())
	if newSigner == util.FormatAddress(validator.Signer) {
		return types.Validator{}, errorsmod.Wrap(types.ErrNoSignerChange, "new signer is the same as old signer")
	}
	if existing, err := k.GetValidatorInfo(ctx, newSigner); err == nil && existing.ValId != validator.ValId {
		return types.Validator{}, errorsmod.Wrapf(sdkerrors.ErrInvalidRequest, "new signer %s already belongs to validator %d", newSigner, existing.ValId)
	}

	approval, err := k.requireFinalizedValidatorApproval(ctx, msg.ValId, "validator signer approval is missing", "validator signer approval is pending 2/3 vote finalization")
	if err != nil {
		return types.Validator{}, err
	}
	if util.FormatAddress(approval.Operator) != validator.OperatorAddress() {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator signer approval operator does not match validator")
	}
	if approval.Nonce != msg.Nonce {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "signer update nonce must match approval nonce")
	}
	if !bytes.Equal(msg.NewSignerPubKey, approval.SignerPubKey) {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "new signer public key does not match approval")
	}

	old := validator
	old.VotingPower = 0
	old.SelfGiltStake = sdkmath.ZeroInt()
	old.DelegatedGiltStake = sdkmath.ZeroInt()
	old.DelegatedGoldStake = sdkmath.ZeroInt()
	old.EffectiveRewardWeight = sdkmath.ZeroInt()
	old.Nonce = msg.Nonce
	old.LastUpdated = nativeLifecycleSequence("signer-update-old", msg.ValId, msg.Nonce)
	old.NormalizeLifecycleAccounting()
	if err := k.AddValidator(ctx, old); err != nil {
		return types.Validator{}, err
	}

	updated := validator
	updated.Signer = newSigner
	updated.PubKey = pubKey.Bytes()
	updated.Nonce = msg.Nonce
	updated.LastUpdated = nativeLifecycleSequence("signer-update", msg.ValId, msg.Nonce)
	updated.NormalizeLifecycleAccounting()
	if err := k.AddValidator(ctx, updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.setNativeLifecycleSequence(ctx, "signer-update", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return updated, nil
}

func (k *Keeper) ExitValidator(ctx context.Context, msg *types.MsgValidatorExit) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.rejectNativeStakeWrite(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.GetValidatorFromValID(ctx, msg.ValId)
	if err != nil {
		return types.Validator{}, err
	}
	if err := requireValidatorOperator(msg.From, validator); err != nil {
		return types.Validator{}, err
	}
	if validator.EndEpoch != 0 {
		return types.Validator{}, errorsmod.Wrap(types.ErrValUnBonded, "validator already exited")
	}
	if msg.Nonce != validator.Nonce+1 {
		return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "invalid validator nonce %d, expected %d", msg.Nonce, validator.Nonce+1)
	}

	params, err := k.GetValidatorLifecycleParams(ctx)
	if err != nil {
		return types.Validator{}, err
	}
	epoch, err := k.currentRewardEpoch(ctx)
	if err != nil {
		return types.Validator{}, err
	}

	updated := validator
	updated.EndEpoch = epoch + params.ValidatorUnbondingEpochs
	updated.VotingPower = 0
	updated.Nonce = msg.Nonce
	updated.LastUpdated = nativeLifecycleSequence("validator-exit", msg.ValId, msg.Nonce)
	updated.NormalizeLifecycleAccounting()

	if err := k.validateValidatorSetSafety(ctx, &updated, epoch); err != nil {
		return types.Validator{}, err
	}
	if err := k.RefreshValidatorRewardWeight(ctx, &updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.AddValidator(ctx, updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.setNativeLifecycleSequence(ctx, "validator-exit", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return updated, nil
}

func (k *Keeper) WithdrawValidatorStake(ctx context.Context, msg *types.MsgWithdrawValidatorStake) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.GetValidatorFromValID(ctx, msg.ValId)
	if err != nil {
		return types.Validator{}, err
	}
	if err := requireValidatorOperator(msg.From, validator); err != nil {
		return types.Validator{}, err
	}
	if validator.EndEpoch == 0 {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator has not exited")
	}
	epoch, err := k.currentRewardEpoch(ctx)
	if err != nil {
		return types.Validator{}, err
	}
	if epoch <= validator.EndEpoch {
		return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "validator unbonding is not complete: current epoch %d, end epoch %d", epoch, validator.EndEpoch)
	}
	if !validator.SelfGiltStake.IsPositive() {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator has no self-staked GILT to withdraw")
	}

	amount := validator.SelfGiltStake
	operatorAddr, _, err := parseDelegator(msg.From)
	if err != nil {
		return types.Validator{}, err
	}
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, operatorAddr, sdk.NewCoins(sdk.NewCoin(types.GiltDenom, amount))); err != nil {
		return types.Validator{}, err
	}

	validator.SelfGiltStake = sdkmath.ZeroInt()
	validator.EffectiveRewardWeight = sdkmath.ZeroInt()
	validator.LastUpdated = nativeLifecycleSequence("withdraw-validator-stake", msg.ValId, epoch)
	validator.NormalizeLifecycleAccounting()
	if err := k.AddValidator(ctx, validator); err != nil {
		return types.Validator{}, err
	}

	return validator, nil
}

func (k Keeper) validateValidatorSetSafety(ctx context.Context, updated *types.Validator, epoch uint64) error {
	params, err := k.GetValidatorLifecycleParams(ctx)
	if err != nil {
		return err
	}

	validators, err := k.validatorSafetySet(ctx, updated)
	if err != nil {
		return err
	}

	activeCount := uint64(0)
	totalPower := int64(0)
	for _, validator := range validators {
		if validator == nil || validator.Jailed || validator.VotingPower <= 0 {
			continue
		}
		if validator.StartEpoch <= epoch && (validator.EndEpoch == 0 || validator.EndEpoch > epoch) {
			activeCount++
			totalPower += validator.VotingPower
		}
	}
	if activeCount < params.MinActiveValidators {
		return errorsmod.Wrapf(types.ErrInvalidMsg, "active validator count %d is below minimum %d", activeCount, params.MinActiveValidators)
	}
	if totalPower <= 0 {
		return errorsmod.Wrap(types.ErrInvalidMsg, "active validator total voting power must be positive")
	}
	for _, validator := range validators {
		if validator == nil || validator.Jailed || validator.VotingPower <= 0 {
			continue
		}
		if validator.StartEpoch > epoch || (validator.EndEpoch != 0 && validator.EndEpoch <= epoch) {
			continue
		}
		if uint64(validator.VotingPower)*10000 > uint64(totalPower)*params.MaxValidatorPowerBps {
			return errorsmod.Wrapf(types.ErrInvalidMsg, "validator %d exceeds max voting power cap", validator.ValId)
		}
	}
	return nil
}

func (k Keeper) validatorSafetySet(ctx context.Context, updated *types.Validator) ([]*types.Validator, error) {
	validators := k.GetAllValidators(ctx)
	result := make([]*types.Validator, 0, len(validators)+1)
	updatedAdded := false

	for _, validator := range validators {
		if validator == nil {
			continue
		}
		validator.NormalizeLifecycleAccounting()

		if validator.ValId == updated.ValId {
			if !updatedAdded {
				result = append(result, updated.Copy())
				updatedAdded = true
			}
			continue
		}

		currentSigner, err := k.GetSignerFromValidatorID(ctx, validator.ValId)
		if err == nil && util.FormatAddress(currentSigner) != util.FormatAddress(validator.Signer) {
			continue
		}
		if err != nil && !errors.Is(err, collections.ErrNotFound) {
			return nil, err
		}

		result = append(result, validator.Copy())
	}

	if !updatedAdded {
		result = append(result, updated.Copy())
	}
	return result, nil
}

func (k Keeper) validatorByOperatorInCurrentSet(ctx context.Context, operator string) (types.Validator, error) {
	validatorSet, err := k.GetValidatorSet(ctx)
	if err != nil {
		return types.Validator{}, err
	}

	normalizedOperator := util.FormatAddress(operator)
	var (
		matched types.Validator
		found   bool
	)

	for _, validator := range validatorSet.Validators {
		if validator == nil || validator.Jailed || validator.VotingPower <= 0 {
			continue
		}
		validator.NormalizeLifecycleAccounting()
		if validator.OperatorAddress() == normalizedOperator {
			if found && matched.ValId != validator.ValId {
				return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "operator %s maps to multiple active validators (%d, %d)", normalizedOperator, matched.ValId, validator.ValId)
			}
			matched = *validator
			found = true
		}
	}

	if found {
		return matched, nil
	}

	return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrUnauthorized, "only active validators can vote on validator approvals")
}

func (k Keeper) ensureOperatorUniqueForApprovalProposal(ctx context.Context, operator string, valID uint64) error {
	normalizedOperator := util.FormatAddress(operator)

	validatorSet, err := k.GetValidatorSet(ctx)
	if err != nil {
		return err
	}
	for _, validator := range validatorSet.Validators {
		if validator == nil || validator.Jailed || validator.VotingPower <= 0 {
			continue
		}
		validator.NormalizeLifecycleAccounting()
		if validator.OperatorAddress() == normalizedOperator && validator.ValId != valID {
			return errorsmod.Wrapf(types.ErrInvalidMsg, "operator %s already controls active validator %d", normalizedOperator, validator.ValId)
		}
	}

	approvals, err := k.GetAllValidatorApprovals(ctx)
	if err != nil {
		return err
	}
	for _, approval := range approvals {
		if approval.ValId == valID || util.FormatAddress(approval.Operator) != normalizedOperator {
			continue
		}

		finalized, err := k.IsValidatorApprovalFinalized(ctx, approval.ValId)
		if err != nil {
			if errors.Is(err, collections.ErrNotFound) {
				continue
			}
			return err
		}
		if !finalized {
			return errorsmod.Wrapf(types.ErrInvalidMsg, "operator %s already has pending validator approval for validator %d", normalizedOperator, approval.ValId)
		}
	}

	return nil
}

func (k Keeper) snapshotVoterValIDForOperator(ctx context.Context, valID uint64, nonce uint64, operator string) (uint64, error) {
	normalizedOperator := util.FormatAddress(operator)
	iterator, err := k.validators.Iterate(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		if closeErr := iterator.Close(); closeErr != nil {
			k.Logger(ctx).Error("Error in closing validator iterator", "error", closeErr)
		}
	}()

	var (
		matchedVoterValID uint64
		found             bool
	)

	for ; iterator.Valid(); iterator.Next() {
		validator, err := iterator.Value()
		if err != nil {
			return 0, err
		}
		validator.NormalizeLifecycleAccounting()

		if validator.OperatorAddress() != normalizedOperator {
			continue
		}

		voteKey := nativeApprovalVoteKey(valID, nonce, validator.ValId)
		exists, err := k.validatorApprovalPowers.Has(ctx, voteKey)
		if err != nil {
			return 0, err
		}
		if !exists {
			continue
		}

		if found && matchedVoterValID != validator.ValId {
			return 0, errorsmod.Wrap(types.ErrInvalidMsg, "voter operator maps to multiple snapshot validators")
		}

		matchedVoterValID = validator.ValId
		found = true
	}

	if !found {
		return 0, errorsmod.Wrap(sdkerrors.ErrUnauthorized, "validator is not eligible in this approval snapshot")
	}

	return matchedVoterValID, nil
}

func (k Keeper) initializeApprovalVoteSnapshot(ctx context.Context, approval types.ValidatorApproval) error {
	validatorSet, err := k.GetValidatorSet(ctx)
	if err != nil {
		return err
	}

	totalPower := uint64(0)
	for _, validator := range validatorSet.Validators {
		if validator == nil || validator.Jailed || validator.VotingPower <= 0 {
			continue
		}
		power := uint64(validator.VotingPower)
		totalPower += power

		voteKey := nativeApprovalVoteKey(approval.ValId, approval.Nonce, validator.ValId)
		if err := k.validatorApprovalPowers.Set(ctx, voteKey, power); err != nil {
			return err
		}
	}
	if totalPower == 0 {
		return errorsmod.Wrap(types.ErrInvalidMsg, "cannot start validator approval vote with zero active validator power")
	}

	if err := k.validatorApprovalTotal.Set(ctx, approval.ValId, totalPower); err != nil {
		return err
	}
	if err := k.validatorApprovalYes.Set(ctx, approval.ValId, 0); err != nil {
		return err
	}
	return k.validatorApprovalDone.Set(ctx, approval.ValId, false)
}

func approvalMatchesMsg(approval types.ValidatorApproval, msg *types.MsgApproveValidator) bool {
	return approval.ValId == msg.ValId &&
		util.FormatAddress(approval.Operator) == util.FormatAddress(msg.Operator) &&
		approval.ActivationEpoch == msg.ActivationEpoch &&
		approval.MaxGiltStake.Equal(msg.MaxGiltStake) &&
		bytes.Equal(approval.SignerPubKey, msg.SignerPubKey) &&
		approval.Nonce == msg.Nonce
}

func (k Keeper) requireFinalizedValidatorApproval(ctx context.Context, valID uint64, missingApprovalMsg string, pendingApprovalMsg string) (types.ValidatorApproval, error) {
	approval, err := k.GetValidatorApproval(ctx, valID)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return types.ValidatorApproval{}, errorsmod.Wrap(types.ErrInvalidMsg, missingApprovalMsg)
		}
		return types.ValidatorApproval{}, err
	}
	finalized, err := k.IsValidatorApprovalFinalized(ctx, valID)
	if err != nil {
		return types.ValidatorApproval{}, err
	}
	if !finalized {
		return types.ValidatorApproval{}, errorsmod.Wrap(types.ErrInvalidMsg, pendingApprovalMsg)
	}
	return approval, nil
}

func nativeApprovalVoteKey(valID uint64, nonce uint64, voterValID uint64) string {
	return fmt.Sprintf("native/approve-validator-vote/%020d/%020d/%020d", valID, nonce, voterValID)
}

func validatorPowerFromGilt(amount sdkmath.Int) (int64, error) {
	power, err := helper.GetPowerFromAmount(amount.BigInt())
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidMsg, err.Error())
	}
	if !power.IsInt64() {
		return 0, errorsmod.Wrap(types.ErrInvalidMsg, "validator voting power does not fit int64")
	}
	return power.Int64(), nil
}

func requireValidatorOperator(from string, validator types.Validator) error {
	if util.FormatAddress(from) != validator.OperatorAddress() {
		return errorsmod.Wrap(sdkerrors.ErrUnauthorized, "validator lifecycle transaction must be submitted by validator operator")
	}
	return nil
}

func (k Keeper) setNativeLifecycleSequence(ctx context.Context, action string, valID uint64, nonce uint64) error {
	sequence := nativeLifecycleSequence(action, valID, nonce)
	if k.HasStakingSequence(ctx, sequence) {
		return errorsmod.Wrap(sdkerrors.ErrConflict, "native validator lifecycle sequence already processed")
	}
	return k.SetStakingSequence(ctx, sequence)
}

func nativeLifecycleSequence(action string, valID uint64, nonce uint64) string {
	return fmt.Sprintf("native/%s/%020d/%020d", action, valID, nonce)
}
