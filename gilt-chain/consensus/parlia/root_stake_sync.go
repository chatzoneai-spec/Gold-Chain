package parlia

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

const (
	rootStakeStatusActive   uint8 = 0
	rootStakeStatusJailed   uint8 = 1
	rootStakeStatusUnstaked uint8 = 2
)

var (
	rootStakePayloadArgs = abi.Arguments{
		{Type: mustABIType("uint256")},
		{Type: mustABIType("address")},
		{Type: mustABIType("uint256")},
		{Type: mustABIType("uint256")},
		{Type: mustABIType("uint8")},
	}
)

// RootStakePayload is the deterministic state-sync payload for finalized root StakingInfo stake events.
type RootStakePayload struct {
	ValidatorID uint64
	Signer      common.Address
	Amount      *big.Int
	Nonce       uint64
	Status      uint8
}

func mustABIType(typeName string) abi.Type {
	typ, err := abi.NewType(typeName, "", nil)
	if err != nil {
		panic(err)
	}
	return typ
}

func EncodeRootStakePayload(payload RootStakePayload) ([]byte, error) {
	if payload.Amount == nil {
		return nil, errors.New("root stake amount is nil")
	}
	if err := validateRootStakeStatus(payload.Status); err != nil {
		return nil, err
	}
	return rootStakePayloadArgs.Pack(
		new(big.Int).SetUint64(payload.ValidatorID),
		payload.Signer,
		payload.Amount,
		new(big.Int).SetUint64(payload.Nonce),
		payload.Status,
	)
}

func DecodeRootStakePayload(data []byte) (RootStakePayload, error) {
	values, err := rootStakePayloadArgs.Unpack(data)
	if err != nil {
		return RootStakePayload{}, err
	}
	if len(values) != 5 {
		return RootStakePayload{}, fmt.Errorf("unexpected root stake payload value count: %d", len(values))
	}

	validatorID, ok := values[0].(*big.Int)
	if !ok || validatorID == nil || !validatorID.IsUint64() {
		return RootStakePayload{}, errors.New("invalid validatorId in root stake payload")
	}
	signer, ok := values[1].(common.Address)
	if !ok {
		return RootStakePayload{}, errors.New("invalid signer in root stake payload")
	}
	amount, ok := values[2].(*big.Int)
	if !ok || amount == nil {
		return RootStakePayload{}, errors.New("invalid amount in root stake payload")
	}
	nonce, ok := values[3].(*big.Int)
	if !ok || nonce == nil || !nonce.IsUint64() {
		return RootStakePayload{}, errors.New("invalid nonce in root stake payload")
	}
	status, ok := values[4].(uint8)
	if !ok {
		return RootStakePayload{}, errors.New("invalid status in root stake payload")
	}
	if err := validateRootStakeStatus(status); err != nil {
		return RootStakePayload{}, err
	}

	return RootStakePayload{
		ValidatorID: validatorID.Uint64(),
		Signer:      signer,
		Amount:      new(big.Int).Set(amount),
		Nonce:       nonce.Uint64(),
		Status:      status,
	}, nil
}

func validateRootStakeStatus(status uint8) error {
	switch status {
	case rootStakeStatusActive, rootStakeStatusJailed, rootStakeStatusUnstaked:
		return nil
	default:
		return fmt.Errorf("invalid root stake status: %d", status)
	}
}
