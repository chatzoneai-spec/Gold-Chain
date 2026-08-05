package stakehub

import (
	_ "embed"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

//go:embed stakehub.abi
var stakehubABIFile string

// StakeHubContract is the Gilt Chain StakeHub system contract address.
var StakeHubContract = common.HexToAddress("0x0000000000000000000000000000000000002002")

// ParsedABI is the parsed StakeHub contract ABI.
var ParsedABI abi.ABI

func init() {
	parsed, err := abi.JSON(strings.NewReader(stakehubABIFile))
	if err != nil {
		panic(err)
	}
	ParsedABI = parsed
}

// Bind returns a bound contract at the given address.
func Bind(address common.Address, backend bind.ContractBackend) (*bind.BoundContract, error) {
	return bind.NewBoundContract(address, ParsedABI, backend, backend, backend), nil
}
