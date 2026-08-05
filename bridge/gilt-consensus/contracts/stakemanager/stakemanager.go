package stakemanager

import (
	_ "embed"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

//go:embed stakemanager.abi
var stakeManagerABIFile string

// ParsedABI is the parsed StakeManager view ABI fragment.
var ParsedABI abi.ABI

func init() {
	parsed, err := abi.JSON(strings.NewReader(stakeManagerABIFile))
	if err != nil {
		panic(err)
	}
	ParsedABI = parsed
}

// Bind returns a bound contract at the given address.
func Bind(address common.Address, backend bind.ContractBackend) (*bind.BoundContract, error) {
	return bind.NewBoundContract(address, ParsedABI, backend, backend, backend), nil
}
