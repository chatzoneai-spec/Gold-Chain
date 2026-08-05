package helper

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/giltchain/gilt-consensus/contracts/stakemanager"
	"github.com/giltchain/gilt-consensus/contracts/validatorsetcommitment"
)

var commitmentDigestArgs abi.Arguments

func init() {
	uint256Type, _ := abi.NewType("uint256", "", nil)
	addressSliceType, _ := abi.NewType("address[]", "", nil)
	bytesSliceType, _ := abi.NewType("bytes[]", "", nil)
	uint256SliceType, _ := abi.NewType("uint256[]", "", nil)
	commitmentDigestArgs = abi.Arguments{
		{Type: uint256Type},
		{Type: addressSliceType},
		{Type: bytesSliceType},
		{Type: uint256SliceType},
	}
}

// SendCommitment submits a ValidatorSetCommitment handoff to the main chain.
func SendCommitment(
	newEpoch *big.Int,
	consensusAddresses []common.Address,
	voteKeys [][]byte,
	votingPowers []*big.Int,
	sigs [][3]*big.Int,
	commitmentAddress common.Address,
	instance *validatorsetcommitment.ValidatorSetCommitment,
) error {
	data, err := validatorsetcommitment.ParsedABI.Pack(
		"submitCommitment",
		newEpoch,
		consensusAddresses,
		voteKeys,
		votingPowers,
		sigs,
	)
	if err != nil {
		Logger.Error("Unable to pack tx for submitCommitment", "error", err)
		return err
	}

	auth, err := GenerateAuthObj(GetMainClient(), commitmentAddress, data)
	if err != nil {
		Logger.Error(errUnableToCreateAuthObj, "error", err)
		return err
	}

	sigLog := make([]string, 0, len(sigs))
	for i := 0; i < len(sigs); i++ {
		sigLog = append(sigLog, fmt.Sprintf("[%s,%s,%s]", sigs[i][0].String(), sigs[i][1].String(), sigs[i][2].String()))
	}

	Logger.Debug("Sending validator set commitment",
		"epoch", newEpoch,
		"validatorCount", len(consensusAddresses),
		"sigs", strings.Join(sigLog, ","),
		"digest", hex.EncodeToString(CommitmentDigest(newEpoch, consensusAddresses, voteKeys, votingPowers)),
	)

	tx, err := instance.SubmitCommitment(auth, newEpoch, consensusAddresses, voteKeys, votingPowers, sigs)
	if err != nil {
		Logger.Error("Error while submitting validator set commitment", "error", err)
		return err
	}

	Logger.Info("Submitted validator set commitment to main chain successfully", "txHash", tx.Hash().String())
	return nil
}

// CommitmentDigest matches ValidatorSetCommitment._commitmentDigest.
func CommitmentDigest(
	epoch *big.Int,
	consensusAddresses []common.Address,
	voteKeys [][]byte,
	votingPowers []*big.Int,
) []byte {
	encoded, err := commitmentDigestArgs.Pack(epoch, consensusAddresses, voteKeys, votingPowers)
	if err != nil {
		panic(err)
	}
	hash := crypto.Keccak256Hash(encoded)
	return hash.Bytes()
}

// GetValidatorSetCommitmentAddress reads StakeManager.validatorSetCommitment().
func (c *ContractCaller) GetValidatorSetCommitmentAddress(stakingInfoAddress string) (common.Address, error) {
	address := common.HexToAddress(stakingInfoAddress)
	contract := bind.NewBoundContract(address, stakemanager.ParsedABI, c.MainChainClient, c.MainChainClient, c.MainChainClient)

	var out []interface{}
	err := contract.Call(&bind.CallOpts{Context: context.Background()}, &out, "validatorSetCommitment")
	if err != nil {
		return common.Address{}, err
	}
	return out[0].(common.Address), nil
}
