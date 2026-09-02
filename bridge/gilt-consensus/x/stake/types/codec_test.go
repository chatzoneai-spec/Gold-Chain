package types_test

import (
	"testing"

	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"github.com/giltchain/gilt-consensus/x/stake/types"
)

func TestRegisterLegacyAminoCodec(t *testing.T) {
	t.Parallel()

	t.Run("registers without panic", func(t *testing.T) {
		t.Parallel()

		cdc := codec.NewLegacyAmino()

		require.NotPanics(t, func() {
			types.RegisterLegacyAminoCodec(cdc)
		})
	})

	t.Run("can marshal messages after registration", func(t *testing.T) {
		t.Parallel()

		cdc := codec.NewLegacyAmino()
		types.RegisterLegacyAminoCodec(cdc)

		msg := &types.MsgWithdrawValidatorStake{
			From:  "0x1234567890123456789012345678901234567890",
			ValId: 1,
		}

		require.NotPanics(t, func() {
			_, err := cdc.MarshalJSON(msg)
			require.NoError(t, err)
		})
	})
}

func TestRegisterInterfaces(t *testing.T) {
	t.Parallel()

	t.Run("registers interfaces without panic", func(t *testing.T) {
		t.Parallel()

		interfaceRegistry := codectypes.NewInterfaceRegistry()

		require.NotPanics(t, func() {
			types.RegisterInterfaces(interfaceRegistry)
		})
	})

	t.Run("can resolve MsgApproveValidator as sdk.Msg", func(t *testing.T) {
		t.Parallel()

		interfaceRegistry := codectypes.NewInterfaceRegistry()
		types.RegisterInterfaces(interfaceRegistry)

		msg := &types.MsgApproveValidator{
			From:         "0x1234567890123456789012345678901234567890",
			ValId:        1,
			SignerPubKey: make([]byte, 65),
		}

		anyMsg, err := codectypes.NewAnyWithValue(msg)
		require.NoError(t, err)
		require.NotNil(t, anyMsg)

		var unpackedMsg sdk.Msg
		err = interfaceRegistry.UnpackAny(anyMsg, &unpackedMsg)
		require.NoError(t, err)
		require.NotNil(t, unpackedMsg)
	})

	t.Run("registered messages implement sdk.Msg interface", func(t *testing.T) {
		t.Parallel()

		var _ sdk.Msg = &types.MsgApproveValidator{}
		var _ sdk.Msg = &types.MsgWithdrawValidatorStake{}
		var _ sdk.Msg = &types.MsgDelegateGold{}
		var _ sdk.Msg = &types.MsgUndelegateGold{}
	})
}
