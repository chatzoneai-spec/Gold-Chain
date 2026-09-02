package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	"github.com/cosmos/cosmos-sdk/codec/legacy"
	"github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

// RegisterLegacyAminoCodec registers the necessary x/stake interfaces and concrete types
// on the provided LegacyAmino codec. These types are used for Amino JSON serialization.
func RegisterLegacyAminoCodec(cdc *codec.LegacyAmino) {
	legacy.RegisterAminoMsg(cdc, &MsgApproveValidator{}, "gilt/stake/MsgApproveValidator")
	legacy.RegisterAminoMsg(cdc, &MsgWithdrawValidatorStake{}, "gilt/stake/MsgWithdrawValStake")
	legacy.RegisterAminoMsg(cdc, &MsgDelegateGold{}, "gilt/stake/MsgDelegateGold")
	legacy.RegisterAminoMsg(cdc, &MsgUndelegateGold{}, "gilt/stake/MsgUndelegateGold")
}

// RegisterInterfaces registers the x/stake interfaces types with the interface registry
func RegisterInterfaces(registry types.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgApproveValidator{},
		&MsgWithdrawValidatorStake{},
		&MsgDelegateGold{},
		&MsgUndelegateGold{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &_Msg_serviceDesc)
}
