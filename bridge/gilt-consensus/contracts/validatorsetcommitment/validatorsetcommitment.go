package validatorsetcommitment

import (
	_ "embed"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

//go:embed validatorsetcommitment.abi
var validatorSetCommitmentABIFile string

// ParsedABI is the parsed ValidatorSetCommitment contract ABI.
var ParsedABI abi.ABI

func init() {
	parsed, err := abi.JSON(strings.NewReader(validatorSetCommitmentABIFile))
	if err != nil {
		panic(err)
	}
	ParsedABI = parsed
}

// NewValidatorSetCommitment binds to a deployed ValidatorSetCommitment contract.
func NewValidatorSetCommitment(address common.Address, backend bind.ContractBackend) (*ValidatorSetCommitment, error) {
	contract, err := bind.NewBoundContract(address, ParsedABI, backend, backend, backend)
	if err != nil {
		return nil, err
	}
	return &ValidatorSetCommitment{
		ValidatorSetCommitmentCaller:     ValidatorSetCommitmentCaller{contract: contract},
		ValidatorSetCommitmentTransactor: ValidatorSetCommitmentTransactor{contract: contract},
	}, nil
}

// ValidatorSetCommitment is a minimal binding for ValidatorSetCommitment.
type ValidatorSetCommitment struct {
	ValidatorSetCommitmentCaller
	ValidatorSetCommitmentTransactor
}

type ValidatorSetCommitmentCaller struct {
	contract *bind.BoundContract
}

type ValidatorSetCommitmentTransactor struct {
	contract *bind.BoundContract
}

func (c *ValidatorSetCommitmentCaller) CommitmentEpoch(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "commitmentEpoch")
	if err != nil {
		return nil, err
	}
	return out[0].(*big.Int), nil
}

func (c *ValidatorSetCommitmentCaller) GetSigners(opts *bind.CallOpts) ([]common.Address, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "getSigners")
	if err != nil {
		return nil, err
	}
	return *abi.ConvertType(out[0], new([]common.Address)).(*[]common.Address), nil
}

func (c *ValidatorSetCommitmentCaller) GetSignerPower(opts *bind.CallOpts, consensusAddress common.Address) (*big.Int, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "getSignerPower", consensusAddress)
	if err != nil {
		return nil, err
	}
	return out[0].(*big.Int), nil
}

func (c *ValidatorSetCommitmentTransactor) SubmitCommitment(
	opts *bind.TransactOpts,
	newEpoch *big.Int,
	consensusAddresses []common.Address,
	voteKeys [][]byte,
	votingPowers []*big.Int,
	sigs [][3]*big.Int,
) (*types.Transaction, error) {
	return c.contract.Transact(opts, "submitCommitment", newEpoch, consensusAddresses, voteKeys, votingPowers, sigs)
}
