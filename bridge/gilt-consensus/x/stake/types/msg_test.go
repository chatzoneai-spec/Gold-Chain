package types_test

import (
	"bytes"
	"testing"

	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	cryptocodec "github.com/cosmos/cosmos-sdk/crypto/codec"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	cryptotypes "github.com/cosmos/cosmos-sdk/crypto/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"github.com/giltchain/gilt-consensus/x/stake/types"
)

func TestMsgDecode(t *testing.T) {
	registry := codectypes.NewInterfaceRegistry()
	cryptocodec.RegisterInterfaces(registry)
	types.RegisterInterfaces(registry)
	cdc := codec.NewProtoCodec(registry)

	// testing the pubKey serialization
	pk1 := secp256k1.GenPrivKey().PubKey()
	pk1bz, err := cdc.MarshalInterface(pk1)
	require.NoError(t, err)
	var pkUnmarshalled cryptotypes.PubKey
	err = cdc.UnmarshalInterface(pk1bz, &pkUnmarshalled)
	require.NoError(t, err)
	require.True(t, pk1.Equals(pkUnmarshalled.(*secp256k1.PubKey)))

	msgApproveValidator, err := types.NewMsgApproveValidator(
		pk1.Address().String(),
		uint64(1),
		pk1.Address().String(),
		uint64(1),
		math.NewInt(int64(1000000000000000000)),
		pk1,
		uint64(1),
	)

	require.NoError(t, err)
	msgSerialized, err := cdc.MarshalInterface(msgApproveValidator)
	require.NoError(t, err)

	var msgUnmarshalled sdk.Msg
	err = cdc.UnmarshalInterface(msgSerialized, &msgUnmarshalled)
	require.NoError(t, err)
	msgApproveValidator2, ok := msgUnmarshalled.(*types.MsgApproveValidator)
	require.True(t, ok)
	require.Equal(t, msgApproveValidator.From, msgApproveValidator2.From)
	require.Equal(t, msgApproveValidator.Operator, msgApproveValidator2.Operator)
	require.Equal(t, msgApproveValidator.ValId, msgApproveValidator2.ValId)
	require.Equal(t, msgApproveValidator.Nonce, msgApproveValidator2.Nonce)
	require.True(t, bytes.Equal(msgApproveValidator.SignerPubKey, msgApproveValidator2.SignerPubKey))

	msgWithdraw := types.NewMsgWithdrawValidatorStake(pk1.Address().String(), uint64(1))
	msgSerialized, err = cdc.MarshalInterface(msgWithdraw)
	require.NoError(t, err)

	err = cdc.UnmarshalInterface(msgSerialized, &msgUnmarshalled)
	require.NoError(t, err)
	msgWithdraw2, ok := msgUnmarshalled.(*types.MsgWithdrawValidatorStake)
	require.True(t, ok)
	require.Equal(t, msgWithdraw.From, msgWithdraw2.From)
	require.Equal(t, msgWithdraw.ValId, msgWithdraw2.ValId)
}

func TestValidatorSignerPublicKeyRejectsInvalidCurvePoint(t *testing.T) {
	t.Parallel()

	pk := secp256k1.GenPrivKey().PubKey()
	invalidPubKey := append([]byte{0x04}, bytes.Repeat([]byte{0xff}, secp256k1.PubKeySize-1)...)

	msg := &types.MsgApproveValidator{
		From:            pk.Address().String(),
		ValId:           1,
		Operator:        pk.Address().String(),
		ActivationEpoch: 1,
		MaxGiltStake:    math.NewInt(1000000000000000000),
		SignerPubKey:    invalidPubKey,
		Nonce:           1,
	}

	err := msg.ValidateBasic()
	require.Error(t, err)
	require.Contains(t, err.Error(), "valid secp256k1 public key")
}
