package types

import (
	"bytes"
	"errors"
	"strconv"

	addressCodec "github.com/cosmos/cosmos-sdk/codec/address"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/gogoproto/proto"
	"github.com/ethereum/go-ethereum/common"

	util "github.com/giltchain/gilt-consensus/common/hex"
)

var _ sdk.Msg = &MsgSlashRelay{}

// MsgSlashRelay packages a finalized child slash for root StakeManager relay.
type MsgSlashRelay struct {
	Proposer         string `protobuf:"bytes,1,opt,name=proposer,proto3" json:"proposer,omitempty"`
	ValidatorId      uint64 `protobuf:"varint,2,opt,name=validator_id,json=validatorId,proto3" json:"validator_id,omitempty"`
	SlashType        uint32 `protobuf:"varint,3,opt,name=slash_type,json=slashType,proto3" json:"slash_type,omitempty"`
	EvidenceRef      []byte `protobuf:"bytes,4,opt,name=evidence_ref,json=evidenceRef,proto3" json:"evidence_ref,omitempty"`
	FinalizedHeight  uint64 `protobuf:"varint,5,opt,name=finalized_height,json=finalizedHeight,proto3" json:"finalized_height,omitempty"`
	GiltChainId      string `protobuf:"bytes,6,opt,name=gilt_chain_id,json=giltChainId,proto3" json:"gilt_chain_id,omitempty"`
}

func (m *MsgSlashRelay) Reset()         { *m = MsgSlashRelay{} }
func (m *MsgSlashRelay) String() string { return proto.CompactTextString(m) }
func (*MsgSlashRelay) ProtoMessage()    {}

// MsgSlashRelayResponse is the slash relay tx response.
type MsgSlashRelayResponse struct{}

func (m *MsgSlashRelayResponse) Reset()         { *m = MsgSlashRelayResponse{} }
func (m *MsgSlashRelayResponse) String() string { return proto.CompactTextString(m) }
func (*MsgSlashRelayResponse) ProtoMessage()    {}

// NewMsgSlashRelay creates a slash relay message.
func NewMsgSlashRelay(
	proposer string,
	validatorID uint64,
	slashType uint8,
	evidenceRef common.Hash,
	finalizedHeight uint64,
	giltChainID string,
) *MsgSlashRelay {
	return &MsgSlashRelay{
		Proposer:         util.FormatAddress(proposer),
		ValidatorId:      validatorID,
		SlashType:        uint32(slashType),
		EvidenceRef:      evidenceRef.Bytes(),
		FinalizedHeight:  finalizedHeight,
		GiltChainId:      giltChainID,
	}
}

func (msg *MsgSlashRelay) ValidateBasic() error {
	if _, err := strconv.ParseUint(msg.GiltChainId, 10, 64); err != nil {
		return ErrInvalidMsg.Wrapf("Invalid gilt chain id %s", msg.GiltChainId)
	}

	if len(msg.EvidenceRef) != common.HashLength {
		return ErrInvalidMsg.Wrapf("Invalid evidence ref length %d", len(msg.EvidenceRef))
	}

	if bytes.Equal(msg.EvidenceRef, common.Hash{}.Bytes()) {
		return ErrInvalidMsg.Wrap("empty evidence ref")
	}

	if msg.ValidatorId == 0 {
		return ErrInvalidMsg.Wrap("validator id required")
	}

	if msg.SlashType > 2 {
		return ErrInvalidMsg.Wrapf("invalid slash type %d", msg.SlashType)
	}

	if msg.FinalizedHeight == 0 {
		return ErrInvalidMsg.Wrap("finalized height required")
	}

	ac := addressCodec.NewHexCodec()
	addrBytes, err := ac.StringToBytes(msg.Proposer)
	if err != nil {
		return ErrInvalidMsg.Wrapf(errInvalidProposerFmt, msg.Proposer)
	}

	accAddr := sdk.AccAddress(addrBytes)
	if accAddr.Empty() {
		return ErrInvalidMsg.Wrapf(errInvalidProposerFmt, msg.Proposer)
	}

	return nil
}

func (msg *MsgSlashRelay) GetSigners() []sdk.AccAddress {
	ac := addressCodec.NewHexCodec()
	addrBytes, err := ac.StringToBytes(msg.Proposer)
	if err != nil {
		panic(errors.New("invalid proposer while getting signers for slash relay msg"))
	}
	return []sdk.AccAddress{addrBytes}
}

// GetSideSignBytes returns the relay payload bytes signed for root StakeManager.relaySlash.
func (msg MsgSlashRelay) GetSideSignBytes() []byte {
	giltChainID, err := strconv.ParseUint(msg.GiltChainId, 10, 64)
	if err != nil {
		panic(errors.New("invalid gilt chain id while getting slash relay side sign bytes"))
	}

	evidenceRef := common.BytesToHash(msg.EvidenceRef)
	data, err := PackSlashRelayData(msg.ValidatorId, uint8(msg.SlashType), evidenceRef, giltChainID)
	if err != nil {
		panic(err)
	}
	return data
}

// IsSlashRelayMsg reports whether msg is a slash relay side tx.
func IsSlashRelayMsg(msg sdk.Msg) bool {
	return sdk.MsgTypeURL(msg) == sdk.MsgTypeURL(&MsgSlashRelay{})
}
