package types

import (
	"bytes"
	"errors"
	"strconv"

	addressCodec "github.com/cosmos/cosmos-sdk/codec/address"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/ethereum/go-ethereum/common"

	util "github.com/giltchain/gilt-consensus/common/hex"
	"github.com/giltchain/gilt-consensus/helper"
)

var _ sdk.Msg = &MsgSlashRelay{}

// MsgSlashRelay packages a finalized child slash for root StakeManager relay.
type MsgSlashRelay struct {
	Proposer         string `json:"proposer"`
	ValidatorId      uint64 `json:"validator_id"`
	SlashType        uint32 `json:"slash_type"`
	EvidenceRef      []byte `json:"evidence_ref"`
	FinalizedHeight  uint64 `json:"finalized_height"`
	GiltChainId      string `json:"gilt_chain_id"`
}

// MsgSlashRelayResponse is the slash relay tx response.
type MsgSlashRelayResponse struct{}

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
	data, err := helper.PackSlashRelayData(msg.ValidatorId, uint8(msg.SlashType), evidenceRef, giltChainID)
	if err != nil {
		panic(err)
	}
	return data
}

// IsSlashRelayMsg reports whether msg is a slash relay side tx.
func IsSlashRelayMsg(msg sdk.Msg) bool {
	return sdk.MsgTypeURL(msg) == sdk.MsgTypeURL(&MsgSlashRelay{})
}
