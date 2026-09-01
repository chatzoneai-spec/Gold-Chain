package keeper

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdkmath "cosmossdk.io/math"
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
	return k.rejectNativeStakeWrite()
}

func (k *Keeper) JoinValidator(ctx context.Context, msg *types.MsgValidatorJoin) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	return types.Validator{}, k.rejectNativeStakeWrite()
}

func (k *Keeper) IncreaseValidatorStake(ctx context.Context, msg *types.MsgStakeUpdate) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	return types.Validator{}, k.rejectNativeStakeWrite()
}

func (k *Keeper) UpdateValidatorSigner(ctx context.Context, msg *types.MsgSignerUpdate) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	return types.Validator{}, k.rejectNativeStakeWrite()
}

func (k *Keeper) ExitValidator(ctx context.Context, msg *types.MsgValidatorExit) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	return types.Validator{}, k.rejectNativeStakeWrite()
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
