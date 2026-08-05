package giltvalidatorset

import (
	_ "embed"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

//go:embed giltvalidatorset.abi
var giltValidatorSetABIFile string

// ValidatorContract is the Gilt Chain GiltValidatorSet system contract address.
var ValidatorContract = common.HexToAddress("0x0000000000000000000000000000000000001000")

// ParsedABI is the parsed GiltValidatorSet contract ABI.
var ParsedABI abi.ABI

func init() {
	parsed, err := abi.JSON(strings.NewReader(giltValidatorSetABIFile))
	if err != nil {
		panic(err)
	}
	ParsedABI = parsed
}

// Bind returns a bound contract at the given address.
func Bind(address common.Address, backend bind.ContractBackend) (*bind.BoundContract, error) {
	return bind.NewBoundContract(address, ParsedABI, backend, backend, backend), nil
}
