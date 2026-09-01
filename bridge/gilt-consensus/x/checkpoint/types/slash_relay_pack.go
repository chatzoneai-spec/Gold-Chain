package types

import (
	"errors"
	"math/big"
	"strconv"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

var slashRelayArgs abi.Arguments

func init() {
	uint256Type, _ := abi.NewType("uint256", "", nil)
	uint8Type, _ := abi.NewType("uint8", "", nil)
	bytes32Type, _ := abi.NewType("bytes32", "", nil)
	slashRelayArgs = abi.Arguments{
		{Type: uint256Type},
		{Type: uint8Type},
		{Type: bytes32Type},
		{Type: uint256Type},
	}
}

// PackSlashRelayData encodes the root StakeManager.relaySlash payload.
func PackSlashRelayData(validatorID uint64, slashType uint8, evidenceRef common.Hash, giltChainID uint64) ([]byte, error) {
	return slashRelayArgs.Pack(
		new(big.Int).SetUint64(validatorID),
		slashType,
		evidenceRef,
		new(big.Int).SetUint64(giltChainID),
	)
}

// UnpackSlashRelayData decodes slash relay packed side sign bytes.
func UnpackSlashRelayData(data []byte) (validatorID uint64, slashType uint8, evidenceRef common.Hash, giltChainID uint64, err error) {
	unpacked, err := slashRelayArgs.Unpack(data)
	if err != nil {
		return 0, 0, common.Hash{}, 0, err
	}

	validatorID = unpacked[0].(*big.Int).Uint64()
	slashType = uint8(unpacked[1].(uint8))
	evidenceRef = unpacked[2].(common.Hash)
	giltChainID = unpacked[3].(*big.Int).Uint64()
	return validatorID, slashType, evidenceRef, giltChainID, nil
}

// UnpackSlashRelaySideSignBytes decodes slash relay packed side sign bytes.
func UnpackSlashRelaySideSignBytes(data []byte) (*MsgSlashRelay, error) {
	if len(data) == 0 {
		return nil, errors.New("empty slash relay side sign bytes")
	}

	validatorID, slashType, evidenceRef, giltChainID, err := UnpackSlashRelayData(data)
	if err != nil {
		return nil, err
	}

	return &MsgSlashRelay{
		ValidatorId:     validatorID,
		SlashType:       uint32(slashType),
		EvidenceRef:     evidenceRef.Bytes(),
		FinalizedHeight: 0,
		GiltChainId:     strconv.FormatUint(giltChainID, 10),
	}, nil
}
