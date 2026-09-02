package types

import (
	sdkmath "cosmossdk.io/math"
	hexCodec "github.com/cosmos/cosmos-sdk/codec/address"
	cryptotypes "github.com/cosmos/cosmos-sdk/crypto/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	util "github.com/giltchain/gilt-consensus/common/hex"
)

const (
	errInvalidValidatorID = "invalid validator id %v"
	errInvalidProposer    = "invalid proposer %v"
)

var (
	_ sdk.Msg = &MsgApproveValidator{}
	_ sdk.Msg = &MsgWithdrawValidatorStake{}
	_ sdk.Msg = &MsgDelegateGold{}
	_ sdk.Msg = &MsgUndelegateGold{}
)

// NewMsgApproveValidator creates a native validator approval message.
func NewMsgApproveValidator(
	from string,
	id uint64,
	operator string,
	activationEpoch uint64,
	maxGiltStake sdkmath.Int,
	pubKey cryptotypes.PubKey,
	nonce uint64,
) (*MsgApproveValidator, error) {
	return &MsgApproveValidator{
		From:            util.FormatAddress(from),
		ValId:           id,
		Operator:        util.FormatAddress(operator),
		ActivationEpoch: activationEpoch,
		MaxGiltStake:    maxGiltStake,
		SignerPubKey:    pubKey.Bytes(),
		Nonce:           nonce,
	}, nil
}

// ValidateBasic validates a native validator approval msg.
func (msg MsgApproveValidator) ValidateBasic() error {
	if msg.ValId == uint64(0) {
		return ErrInvalidMsg.Wrapf(errInvalidValidatorID, msg.ValId)
	}
	if err := validateAccountAddress(msg.From); err != nil {
		return err
	}
	if err := validateAccountAddress(msg.Operator); err != nil {
		return ErrInvalidMsg.Wrapf("invalid operator %s", msg.Operator)
	}
	if err := validateSignerPubKeyBytes("signer public key", msg.SignerPubKey); err != nil {
		return err
	}
	if !normalizeInt(msg.MaxGiltStake).IsPositive() {
		return ErrInvalidMsg.Wrapf("invalid max GILT stake %v", msg.MaxGiltStake)
	}
	return nil
}

// NewMsgWithdrawValidatorStake creates a MsgWithdrawValidatorStake instance.
func NewMsgWithdrawValidatorStake(from string, id uint64) *MsgWithdrawValidatorStake {
	return &MsgWithdrawValidatorStake{
		From:  util.FormatAddress(from),
		ValId: id,
	}
}

// ValidateBasic validates validator self-stake withdrawal.
func (msg MsgWithdrawValidatorStake) ValidateBasic() error {
	if msg.ValId == uint64(0) {
		return ErrInvalidMsg.Wrapf(errInvalidValidatorID, msg.ValId)
	}
	if err := validateAccountAddress(msg.From); err != nil {
		return err
	}
	return nil
}

// NewMsgDelegateGold creates a MsgDelegateGold instance.
func NewMsgDelegateGold(from string, id uint64, amount sdkmath.Int) *MsgDelegateGold {
	return &MsgDelegateGold{
		From:   util.FormatAddress(from),
		ValId:  id,
		Amount: amount,
	}
}

// ValidateBasic validates the GOLD delegation msg before it is executed.
func (msg MsgDelegateGold) ValidateBasic() error {
	if msg.ValId == uint64(0) {
		return ErrInvalidMsg.Wrapf(errInvalidValidatorID, msg.ValId)
	}

	if err := validateAccountAddress(msg.From); err != nil {
		return err
	}

	if !msg.Amount.IsPositive() {
		return ErrInvalidMsg.Wrapf("invalid GOLD amount %v", msg.Amount)
	}

	return nil
}

// NewMsgUndelegateGold creates a MsgUndelegateGold instance.
func NewMsgUndelegateGold(from string, id uint64, amount sdkmath.Int) *MsgUndelegateGold {
	return &MsgUndelegateGold{
		From:   util.FormatAddress(from),
		ValId:  id,
		Amount: amount,
	}
}

// ValidateBasic validates the GOLD undelegation msg before it is executed.
func (msg MsgUndelegateGold) ValidateBasic() error {
	if msg.ValId == uint64(0) {
		return ErrInvalidMsg.Wrapf(errInvalidValidatorID, msg.ValId)
	}

	if err := validateAccountAddress(msg.From); err != nil {
		return err
	}

	if !msg.Amount.IsPositive() {
		return ErrInvalidMsg.Wrapf("invalid GOLD amount %v", msg.Amount)
	}

	return nil
}

func validateAccountAddress(address string) error {
	if address == "" {
		return ErrInvalidMsg.Wrapf(errInvalidProposer, address)
	}
	ac := hexCodec.NewHexCodec()
	addrBytes, err := ac.StringToBytes(address)
	if err != nil {
		return ErrInvalidMsg.Wrapf(errInvalidProposer, address)
	}
	if sdk.AccAddress(addrBytes).Empty() {
		return ErrInvalidMsg.Wrapf(errInvalidProposer, address)
	}
	return nil
}
