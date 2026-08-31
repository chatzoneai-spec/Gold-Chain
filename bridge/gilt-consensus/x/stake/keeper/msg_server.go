package keeper

import (
	"context"
	"strconv"
	"time"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	util "github.com/giltchain/gilt-consensus/common/hex"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/giltchain/gilt-consensus/metrics/api"
	hmTypes "github.com/giltchain/gilt-consensus/types"
	"github.com/giltchain/gilt-consensus/x/stake/types"
)

type msgServer struct {
	k *Keeper
}

// NewMsgServerImpl returns an implementation of the staking MsgServer interface.
func NewMsgServerImpl(keeper *Keeper) types.MsgServer {
	return &msgServer{k: keeper}
}

// ApproveValidator records a native validator approval vote.
func (srv msgServer) ApproveValidator(ctx context.Context, msg *types.MsgApproveValidator) (*types.MsgApproveValidatorResponse, error) {
	var err error
	startTime := time.Now()
	defer recordStakeTransactionMetric(api.ApproveValidatorMethod, startTime, &err)

	err = srv.k.rejectNativeStakeWrite()
	if err != nil {
		return nil, err
	}
	return &types.MsgApproveValidatorResponse{}, nil
}

// ValidatorJoin processes a root-anchored validator join.
func (srv msgServer) ValidatorJoin(ctx context.Context, msg *types.MsgValidatorJoin) (*types.MsgValidatorJoinResponse, error) {
	var err error
	startTime := time.Now()
	defer recordStakeTransactionMetric(api.ValidatorJoinMethod, startTime, &err)

	if !helper.IsRootAnchoredStakeReadEnabled() {
		return nil, errorsmod.Wrap(types.ErrNativeStakeRetired, "validator join requires root-anchored stake")
	}

	validator, err := srv.k.JoinValidatorFromRoot(ctx, msg)
	if err != nil {
		return nil, err
	}

	emitValidatorEvent(ctx, types.EventTypeValidatorJoin, validator.ValId, validator.OperatorAddress(), validator.Signer, validator.Nonce)
	return &types.MsgValidatorJoinResponse{}, nil
}

// StakeUpdate sets validator GILT stake from the root-anchored source of truth.
func (srv msgServer) StakeUpdate(ctx context.Context, msg *types.MsgStakeUpdate) (*types.MsgStakeUpdateResponse, error) {
	var err error
	startTime := time.Now()
	defer recordStakeTransactionMetric(api.StakeUpdateMethod, startTime, &err)

	if !helper.IsRootAnchoredStakeReadEnabled() {
		return nil, errorsmod.Wrap(types.ErrNativeStakeRetired, "stake update requires root-anchored stake")
	}

	validator, err := srv.k.SetValidatorStakeFromRoot(ctx, msg)
	if err != nil {
		return nil, err
	}

	emitValidatorEvent(ctx, types.EventTypeStakeUpdate, validator.ValId, validator.OperatorAddress(), validator.Signer, validator.Nonce)
	return &types.MsgStakeUpdateResponse{}, nil
}

// SignerUpdate updates the signer key from the root-anchored source of truth.
func (srv msgServer) SignerUpdate(ctx context.Context, msg *types.MsgSignerUpdate) (*types.MsgSignerUpdateResponse, error) {
	var err error
	startTime := time.Now()
	defer recordStakeTransactionMetric(api.SignerUpdateMethod, startTime, &err)

	if !helper.IsRootAnchoredStakeReadEnabled() {
		return nil, errorsmod.Wrap(types.ErrNativeStakeRetired, "signer update requires root-anchored stake")
	}

	validator, err := srv.k.UpdateValidatorSignerFromRoot(ctx, msg)
	if err != nil {
		return nil, err
	}

	emitValidatorEvent(ctx, types.EventTypeSignerUpdate, validator.ValId, validator.OperatorAddress(), validator.Signer, validator.Nonce)
	return &types.MsgSignerUpdateResponse{}, nil
}

// ValidatorExit exits a validator through root-anchored Gold Chain state.
func (srv msgServer) ValidatorExit(ctx context.Context, msg *types.MsgValidatorExit) (*types.MsgValidatorExitResponse, error) {
	var err error
	startTime := time.Now()
	defer recordStakeTransactionMetric(api.ValidatorExitMethod, startTime, &err)

	if !helper.IsRootAnchoredStakeReadEnabled() {
		return nil, errorsmod.Wrap(types.ErrNativeStakeRetired, "validator exit requires root-anchored stake")
	}
	if msg.RootDeactivationEpoch == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidMsg, "missing root deactivation epoch")
	}
	validator, err := srv.k.ExitValidatorFromRoot(ctx, msg, msg.RootDeactivationEpoch)
	if err != nil {
		return nil, err
	}

	emitValidatorEvent(ctx, types.EventTypeValidatorExit, validator.ValId, validator.OperatorAddress(), validator.Signer, validator.Nonce)
	return &types.MsgValidatorExitResponse{}, nil
}

// WithdrawValidatorStake releases self-staked GILT after exit unbonding.
func (srv msgServer) WithdrawValidatorStake(ctx context.Context, msg *types.MsgWithdrawValidatorStake) (*types.MsgWithdrawValidatorStakeResponse, error) {
	validator, err := srv.k.WithdrawValidatorStake(ctx, msg)
	if err != nil {
		return nil, err
	}

	emitValidatorEvent(ctx, types.EventTypeWithdrawValidatorStake, validator.ValId, validator.OperatorAddress(), validator.Signer, validator.Nonce)
	return &types.MsgWithdrawValidatorStakeResponse{}, nil
}

// DelegateGold escrows GOLD and updates validator reward weight.
func (srv msgServer) DelegateGold(ctx context.Context, msg *types.MsgDelegateGold) (*types.MsgDelegateGoldResponse, error) {
	err := msg.ValidateBasic()
	if err != nil {
		srv.k.Logger(ctx).Error(hmTypes.ErrMsgValidationFailed, hmTypes.LogKeyError, err)
		return nil, errorsmod.Wrap(types.ErrInvalidMsg, hmTypes.ErrMsgValidationFailed)
	}

	if err := srv.k.DelegateGold(ctx, msg.From, msg.ValId, msg.Amount); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeDelegateGold,
			sdk.NewAttribute(sdk.AttributeKeyModule, types.AttributeValueCategory),
			sdk.NewAttribute(types.AttributeKeyDelegator, util.FormatAddress(msg.From)),
			sdk.NewAttribute(types.AttributeKeyValidatorID, strconv.FormatUint(msg.ValId, 10)),
			sdk.NewAttribute(types.AttributeKeyAmount, msg.Amount.String()),
		),
	)

	return &types.MsgDelegateGoldResponse{}, nil
}

// UndelegateGold releases escrowed GOLD and updates validator reward weight.
func (srv msgServer) UndelegateGold(ctx context.Context, msg *types.MsgUndelegateGold) (*types.MsgUndelegateGoldResponse, error) {
	err := msg.ValidateBasic()
	if err != nil {
		srv.k.Logger(ctx).Error(hmTypes.ErrMsgValidationFailed, hmTypes.LogKeyError, err)
		return nil, errorsmod.Wrap(types.ErrInvalidMsg, hmTypes.ErrMsgValidationFailed)
	}

	if err := srv.k.UndelegateGold(ctx, msg.From, msg.ValId, msg.Amount); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeUndelegateGold,
			sdk.NewAttribute(sdk.AttributeKeyModule, types.AttributeValueCategory),
			sdk.NewAttribute(types.AttributeKeyDelegator, util.FormatAddress(msg.From)),
			sdk.NewAttribute(types.AttributeKeyValidatorID, strconv.FormatUint(msg.ValId, 10)),
			sdk.NewAttribute(types.AttributeKeyAmount, msg.Amount.String()),
		),
	)

	return &types.MsgUndelegateGoldResponse{}, nil
}

func emitValidatorEvent(ctx context.Context, eventType string, valID uint64, operator string, signer string, nonce uint64) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	attrs := []sdk.Attribute{
		sdk.NewAttribute(sdk.AttributeKeyModule, types.AttributeValueCategory),
		sdk.NewAttribute(types.AttributeKeyValidatorID, strconv.FormatUint(valID, 10)),
		sdk.NewAttribute(types.AttributeKeyOperator, util.FormatAddress(operator)),
		sdk.NewAttribute(types.AttributeKeyValidatorNonce, strconv.FormatUint(nonce, 10)),
	}
	if signer != "" {
		attrs = append(attrs, sdk.NewAttribute(types.AttributeKeySigner, util.FormatAddress(signer)))
	}
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(eventType, attrs...))
}

func emitApprovalVoteEvent(ctx context.Context, msg *types.MsgApproveValidator, yesPower uint64, totalPower uint64, finalized bool) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	attrs := []sdk.Attribute{
		sdk.NewAttribute(sdk.AttributeKeyModule, types.AttributeValueCategory),
		sdk.NewAttribute(types.AttributeKeyValidatorID, strconv.FormatUint(msg.ValId, 10)),
		sdk.NewAttribute(types.AttributeKeyOperator, util.FormatAddress(msg.Operator)),
		sdk.NewAttribute(types.AttributeKeyVoter, util.FormatAddress(msg.From)),
		sdk.NewAttribute(types.AttributeKeyValidatorNonce, strconv.FormatUint(msg.Nonce, 10)),
		sdk.NewAttribute(types.AttributeKeyApprovalYes, strconv.FormatUint(yesPower, 10)),
		sdk.NewAttribute(types.AttributeKeyApprovalTotal, strconv.FormatUint(totalPower, 10)),
		sdk.NewAttribute(types.AttributeKeyApprovalDone, strconv.FormatBool(finalized)),
	}
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(types.EventTypeApproveValidator, attrs...))
}

func recordStakeTransactionMetric(method string, start time.Time, err *error) {
	success := *err == nil
	api.RecordAPICallWithStart(api.StakeSubsystem, method, api.TxType, success, start)
}
