// Code generated - retained Gold Chain bridge binding. DO NOT EDIT.

package stakinginfo

import (
	"errors"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// StakinginfoMetaData contains the bridge ABI surface for root StakingInfo events.
var StakinginfoMetaData = &bind.MetaData{
	ABI: "[{\"constant\":true,\"inputs\":[],\"name\":\"getAccountStateRoot\",\"outputs\":[{\"internalType\":\"bytes32\",\"name\":\"accountStateRoot\",\"type\":\"bytes32\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"signer\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"activationEpoch\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"total\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"bytes\",\"name\":\"signerPubkey\",\"type\":\"bytes\"}],\"name\":\"Staked\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"user\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"total\",\"type\":\"uint256\"}],\"name\":\"Unstaked\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"user\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"deactivationEpoch\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"UnstakeInit\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"oldSigner\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"newSigner\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"bytes\",\"name\":\"signerPubkey\",\"type\":\"bytes\"}],\"name\":\"SignerChange\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"total\",\"type\":\"uint256\"}],\"name\":\"Restaked\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"newAmount\",\"type\":\"uint256\"}],\"name\":\"StakeUpdate\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"user\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"tokens\",\"type\":\"uint256\"}],\"name\":\"ShareMinted\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"user\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"tokens\",\"type\":\"uint256\"}],\"name\":\"ShareBurned\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"user\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"fee\",\"type\":\"uint256\"}],\"name\":\"TopUpFee\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"Slashed\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"validatorId\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"signer\",\"type\":\"address\"}],\"name\":\"UnJailed\",\"type\":\"event\"}]",
}

// Deprecated: Use StakinginfoMetaData.ABI instead.
var StakinginfoABI = StakinginfoMetaData.ABI

// Stakinginfo is a minimal binding for retained bridge reads.
type Stakinginfo struct {
	contract *bind.BoundContract
}

// NewStakinginfo creates a new minimal StakingInfo binding.
func NewStakinginfo(address common.Address, backend bind.ContractBackend) (*Stakinginfo, error) {
	parsed, err := abi.JSON(strings.NewReader(StakinginfoMetaData.ABI))
	if err != nil {
		return nil, err
	}

	return &Stakinginfo{
		contract: bind.NewBoundContract(address, parsed, backend, backend, backend),
	}, nil
}

// GetAccountStateRoot reads the retained account-state root for topup accounting.
func (_Stakinginfo *Stakinginfo) GetAccountStateRoot(opts *bind.CallOpts) ([32]byte, error) {
	var out []interface{}
	err := _Stakinginfo.contract.Call(opts, &out, "getAccountStateRoot")
	if err != nil {
		return [32]byte{}, err
	}
	if len(out) == 0 {
		return [32]byte{}, errors.New("stakinginfo getAccountStateRoot returned no data")
	}

	return *abi.ConvertType(out[0], new([32]byte)).(*[32]byte), nil
}

// StakinginfoStaked represents a Staked event.
type StakinginfoStaked struct {
	Signer          common.Address
	ValidatorId     *big.Int
	Nonce           *big.Int
	ActivationEpoch *big.Int
	Amount          *big.Int
	Total           *big.Int
	SignerPubkey    []byte
	Raw             types.Log
}

// StakinginfoUnstaked represents an Unstaked event.
type StakinginfoUnstaked struct {
	User        common.Address
	ValidatorId *big.Int
	Amount      *big.Int
	Total       *big.Int
	Raw         types.Log
}

// StakinginfoUnstakeInit represents an UnstakeInit event.
type StakinginfoUnstakeInit struct {
	User              common.Address
	ValidatorId       *big.Int
	Nonce             *big.Int
	DeactivationEpoch *big.Int
	Amount            *big.Int
	Raw               types.Log
}

// StakinginfoSignerChange represents a SignerChange event.
type StakinginfoSignerChange struct {
	ValidatorId  *big.Int
	Nonce        *big.Int
	OldSigner    common.Address
	NewSigner    common.Address
	SignerPubkey []byte
	Raw          types.Log
}

// StakinginfoRestaked represents a Restaked event.
type StakinginfoRestaked struct {
	ValidatorId *big.Int
	Amount      *big.Int
	Total       *big.Int
	Raw         types.Log
}

// StakinginfoStakeUpdate represents a StakeUpdate event.
type StakinginfoStakeUpdate struct {
	ValidatorId *big.Int
	Nonce       *big.Int
	NewAmount   *big.Int
	Raw         types.Log
}

// StakinginfoShareMinted represents a ShareMinted event.
type StakinginfoShareMinted struct {
	ValidatorId *big.Int
	User        common.Address
	Amount      *big.Int
	Tokens      *big.Int
	Raw         types.Log
}

// StakinginfoShareBurned represents a ShareBurned event.
type StakinginfoShareBurned struct {
	ValidatorId *big.Int
	User        common.Address
	Amount      *big.Int
	Tokens      *big.Int
	Raw         types.Log
}

// StakinginfoTopUpFee represents a retained TopUpFee event.
type StakinginfoTopUpFee struct {
	User common.Address
	Fee  *big.Int
	Raw  types.Log
}

// StakinginfoSlashed represents a retained Slashed event.
type StakinginfoSlashed struct {
	Nonce  *big.Int
	Amount *big.Int
	Raw    types.Log
}

// StakinginfoUnJailed represents a retained UnJailed event.
type StakinginfoUnJailed struct {
	ValidatorId *big.Int
	Signer      common.Address
	Raw         types.Log
}
