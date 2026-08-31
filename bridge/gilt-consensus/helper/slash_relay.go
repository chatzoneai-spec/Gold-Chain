package helper

import (
	"fmt"
	"math/big"
	"strconv"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/giltchain/gilt-consensus/contracts/stakemanager"
	checkpointtypes "github.com/giltchain/gilt-consensus/x/checkpoint/types"
)

const slashVotePrefix byte = 0x02

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

// SlashRelayVoteHash returns keccak256(0x02 || data) used by StakeManager signature verification.
func SlashRelayVoteHash(data []byte) common.Hash {
	return crypto.Keccak256Hash([]byte{slashVotePrefix}, data)
}

// UnpackSlashRelaySideSignBytes decodes slash relay packed side sign bytes.
func UnpackSlashRelaySideSignBytes(data []byte) (*checkpointtypes.MsgSlashRelay, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty slash relay side sign bytes")
	}

	unpacked, err := slashRelayArgs.Unpack(data)
	if err != nil {
		return nil, err
	}

	validatorID := unpacked[0].(*big.Int).Uint64()
	slashType := uint8(unpacked[1].(uint8))
	evidenceRef := unpacked[2].(common.Hash)
	giltChainID := unpacked[3].(*big.Int).Uint64()

	return &checkpointtypes.MsgSlashRelay{
		ValidatorId:     validatorID,
		SlashType:       uint32(slashType),
		EvidenceRef:     evidenceRef.Bytes(),
		FinalizedHeight: 0,
		GiltChainId:     strconv.FormatUint(giltChainID, 10),
	}, nil
}

// SendSlashRelay submits an authenticated slash to root StakeManager.
func (c *ContractCaller) SendSlashRelay(
	data []byte,
	sigs [][3]*big.Int,
	stakeManagerAddress common.Address,
) error {
	packed, err := stakemanager.ParsedABI.Pack("relaySlash", data, sigs)
	if err != nil {
		Logger.Error("Unable to pack tx for relaySlash", "error", err)
		return err
	}

	auth, err := GenerateAuthObj(GetMainClient(), stakeManagerAddress, packed)
	if err != nil {
		Logger.Error(errUnableToCreateAuthObj, "error", err)
		return err
	}

	sigLog := make([]string, 0, len(sigs))
	for i := 0; i < len(sigs); i++ {
		sigLog = append(sigLog, fmt.Sprintf("[%s,%s,%s]", sigs[i][0].String(), sigs[i][1].String(), sigs[i][2].String()))
	}

	Logger.Debug("Sending slash relay to StakeManager",
		"sigs", strings.Join(sigLog, ","),
		"data", common.Bytes2Hex(data),
		"voteHash", SlashRelayVoteHash(data).Hex(),
	)

	bound, err := stakemanager.Bind(stakeManagerAddress, GetMainClient())
	if err != nil {
		return err
	}

	tx, err := bound.Transact(auth, "relaySlash", data, sigs)
	if err != nil {
		Logger.Error("Error while submitting slash relay", "error", err)
		return err
	}

	Logger.Info("Submitted slash relay to StakeManager successfully", "txHash", tx.Hash().String())
	return nil
}
