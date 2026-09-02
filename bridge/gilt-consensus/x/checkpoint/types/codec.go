package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	"github.com/cosmos/cosmos-sdk/codec/legacy"
	"github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

// RegisterLegacyAminoCodec registers the necessary x/checkpoint interfaces and concrete types
// on the provided LegacyAmino codec. These types are used for Amino JSON serialization.
func RegisterLegacyAminoCodec(cdc *codec.LegacyAmino) {
	legacy.RegisterAminoMsg(cdc, &MsgCheckpoint{}, "gilt/checkpoint/MsgCheckpoint")
	legacy.RegisterAminoMsg(cdc, &MsgCpAck{}, "gilt/checkpoint/MsgCpAck")
	legacy.RegisterAminoMsg(cdc, &MsgCpNoAck{}, "gilt/checkpoint/MsgCpNoAck")
	legacy.RegisterAminoMsg(cdc, &MsgUpdateParams{}, "gilt/checkpoint/MsgUpdateParams")
}

// RegisterInterfaces registers the x/checkpoint interfaces types with the interface registry
func RegisterInterfaces(registry types.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgCheckpoint{},
		&MsgCpAck{},
		&MsgCpNoAck{},
		&MsgUpdateParams{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &_Msg_serviceDesc)
}
