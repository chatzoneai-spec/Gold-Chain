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
	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"

	util "github.com/giltchain/gilt-consensus/common/hex"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/giltchain/gilt-consensus/x/stake/types"
)

func (k *Keeper) ensureRootAnchoredStakeReadEnabled() error {
	if !helper.IsRootAnchoredStakeReadEnabled() {
		return errorsmod.Wrap(types.ErrInvalidMsg, "root-anchored stake read path is disabled; validator set frozen at last-known-good")
	}
	return nil
}

func (k *Keeper) requireRootValidatorNonce(ctx context.Context, valID uint64, nonce uint64) (types.Validator, error) {
	validator, err := k.GetValidatorFromValID(ctx, valID)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			if nonce != 1 {
				return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "invalid validator nonce %d for new validator, expected 1", nonce)
			}
			return types.Validator{}, nil
		}
		return types.Validator{}, err
	}

	if nonce != validator.Nonce+1 {
		return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "invalid validator nonce %d, expected %d", nonce, validator.Nonce+1)
	}

	return validator, nil
}

func (k *Keeper) JoinValidatorFromRoot(ctx context.Context, msg *types.MsgValidatorJoin) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.ensureRootAnchoredStakeReadEnabled(); err != nil {
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
	if msg.Nonce == 0 {
		return types.Validator{}, errorsmod.Wrap(types.ErrInvalidMsg, "validator nonce must be positive")
	}
	if _, err := k.requireRootValidatorNonce(ctx, msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	pubKey := secp256k1.PubKey{Key: bytes.Clone(msg.SignerPubKey)}
	if pubKey.Type() != types.Secp256k1Type {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, "validator signer public key is invalid")
	}
	signer, err := types.SignerAddressFromPubKey(msg.SignerPubKey)
	if err != nil {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, err.Error())
	}
	signer = util.FormatAddress(signer)
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
		LastUpdated:           rootLifecycleSequence("staked", msg.ValId, msg.Nonce),
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
	if err := k.RefreshValidatorRewardWeight(ctx, &validator); err != nil {
		return types.Validator{}, err
	}
	if err := k.AddValidator(ctx, validator); err != nil {
		return types.Validator{}, err
	}
	if err := k.setRootLifecycleSequence(ctx, "staked", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return validator, nil
}

func (k *Keeper) SetValidatorStakeFromRoot(ctx context.Context, msg *types.MsgStakeUpdate) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.ensureRootAnchoredStakeReadEnabled(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.GetValidatorFromValID(ctx, msg.ValId)
	if err != nil {
		return types.Validator{}, err
	}
	if validator.Nonce == msg.Nonce {
		// Unstaked events carry no nonce; allow idempotent total-stake refresh at the current nonce.
	} else if msg.Nonce != validator.Nonce+1 {
		return types.Validator{}, errorsmod.Wrapf(types.ErrInvalidMsg, "invalid validator nonce %d, expected %d", msg.Nonce, validator.Nonce+1)
	}

	power, err := validatorPowerFromGilt(msg.NewAmount)
	if err != nil {
		return types.Validator{}, err
	}

	updated := validator
	updated.SelfGiltStake = msg.NewAmount
	updated.VotingPower = power
	if msg.Nonce != validator.Nonce {
		updated.Nonce = msg.Nonce
	}
	updated.LastUpdated = rootLifecycleSequence("stake-update", msg.ValId, msg.Nonce)
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
	if err := k.RefreshValidatorRewardWeight(ctx, &updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.AddValidator(ctx, updated); err != nil {
		return types.Validator{}, err
	}
	if msg.Nonce != validator.Nonce {
		if err := k.setRootLifecycleSequence(ctx, "stake-update", msg.ValId, msg.Nonce); err != nil {
			return types.Validator{}, err
		}
	}

	return updated, nil
}

func (k *Keeper) UpdateValidatorSignerFromRoot(ctx context.Context, msg *types.MsgSignerUpdate) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.ensureRootAnchoredStakeReadEnabled(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.requireRootValidatorNonce(ctx, msg.ValId, msg.Nonce)
	if err != nil {
		return types.Validator{}, err
	}

	pubKey := secp256k1.PubKey{Key: bytes.Clone(msg.NewSignerPubKey)}
	if pubKey.Type() != types.Secp256k1Type {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, "new signer public key is invalid")
	}
	newSigner, err := types.SignerAddressFromPubKey(msg.NewSignerPubKey)
	if err != nil {
		return types.Validator{}, errorsmod.Wrap(sdkerrors.ErrInvalidRequest, err.Error())
	}
	newSigner = util.FormatAddress(newSigner)
	if newSigner == util.FormatAddress(validator.Signer) {
		return types.Validator{}, errorsmod.Wrap(types.ErrNoSignerChange, "new signer is the same as old signer")
	}
	if existing, err := k.GetValidatorInfo(ctx, newSigner); err == nil && existing.ValId != validator.ValId {
		return types.Validator{}, errorsmod.Wrapf(sdkerrors.ErrInvalidRequest, "new signer %s already belongs to validator %d", newSigner, existing.ValId)
	}

	old := validator
	old.VotingPower = 0
	old.SelfGiltStake = sdkmath.ZeroInt()
	old.DelegatedGiltStake = sdkmath.ZeroInt()
	old.DelegatedGoldStake = sdkmath.ZeroInt()
	old.EffectiveRewardWeight = sdkmath.ZeroInt()
	old.Nonce = msg.Nonce
	old.LastUpdated = rootLifecycleSequence("signer-update-old", msg.ValId, msg.Nonce)
	old.NormalizeLifecycleAccounting()
	if err := k.AddValidator(ctx, old); err != nil {
		return types.Validator{}, err
	}

	updated := validator
	updated.Signer = newSigner
	updated.PubKey = pubKey.Bytes()
	updated.Nonce = msg.Nonce
	updated.LastUpdated = rootLifecycleSequence("signer-update", msg.ValId, msg.Nonce)
	updated.NormalizeLifecycleAccounting()
	if err := k.AddValidator(ctx, updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.setRootLifecycleSequence(ctx, "signer-update", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return updated, nil
}

func (k *Keeper) ExitValidatorFromRoot(ctx context.Context, msg *types.MsgValidatorExit, deactivationEpoch uint64) (types.Validator, error) {
	k.PanicIfSetupIsIncomplete()
	if err := k.ensureRootAnchoredStakeReadEnabled(); err != nil {
		return types.Validator{}, err
	}
	if err := msg.ValidateBasic(); err != nil {
		return types.Validator{}, err
	}

	validator, err := k.requireRootValidatorNonce(ctx, msg.ValId, msg.Nonce)
	if err != nil {
		return types.Validator{}, err
	}
	if validator.EndEpoch != 0 {
		return types.Validator{}, errorsmod.Wrap(types.ErrValUnBonded, "validator already exited")
	}

	updated := validator
	updated.EndEpoch = deactivationEpoch
	updated.VotingPower = 0
	updated.Nonce = msg.Nonce
	updated.LastUpdated = rootLifecycleSequence("unstake-init", msg.ValId, msg.Nonce)
	updated.NormalizeLifecycleAccounting()

	epoch, err := k.currentRewardEpoch(ctx)
	if err != nil {
		return types.Validator{}, err
	}
	if err := k.validateValidatorSetSafety(ctx, &updated, epoch); err != nil {
		return types.Validator{}, err
	}
	if err := k.RefreshValidatorRewardWeight(ctx, &updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.AddValidator(ctx, updated); err != nil {
		return types.Validator{}, err
	}
	if err := k.setRootLifecycleSequence(ctx, "unstake-init", msg.ValId, msg.Nonce); err != nil {
		return types.Validator{}, err
	}

	return updated, nil
}

func (k *Keeper) setRootLifecycleSequence(ctx context.Context, action string, valID uint64, nonce uint64) error {
	sequence := rootLifecycleSequence(action, valID, nonce)
	if k.HasStakingSequence(ctx, sequence) {
		return errorsmod.Wrap(sdkerrors.ErrConflict, "root validator lifecycle sequence already processed")
	}
	return k.SetStakingSequence(ctx, sequence)
}

func rootLifecycleSequence(action string, valID uint64, nonce uint64) string {
	return fmt.Sprintf("root/%s/%020d/%020d", action, valID, nonce)
}
