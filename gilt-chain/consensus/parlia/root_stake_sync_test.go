package parlia

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestRootStakePayloadRoundTrip(t *testing.T) {
	want := RootStakePayload{
		ValidatorID: 42,
		Signer:      common.HexToAddress("0x225D6AF01985dd4f627abbe1ee0062Fce8C3f5D0"),
		Amount:      new(big.Int).Mul(big.NewInt(9000), big.NewInt(1e18)),
		Nonce:       7,
		Status:      rootStakeStatusActive,
	}

	encoded, err := EncodeRootStakePayload(want)
	if err != nil {
		t.Fatalf("encode root stake payload: %v", err)
	}

	got, err := DecodeRootStakePayload(encoded)
	if err != nil {
		t.Fatalf("decode root stake payload: %v", err)
	}
	if got.ValidatorID != want.ValidatorID {
		t.Fatalf("validator id mismatch: got %d want %d", got.ValidatorID, want.ValidatorID)
	}
	if got.Signer != want.Signer {
		t.Fatalf("signer mismatch: got %s want %s", got.Signer.Hex(), want.Signer.Hex())
	}
	if got.Amount.Cmp(want.Amount) != 0 {
		t.Fatalf("amount mismatch: got %s want %s", got.Amount, want.Amount)
	}
	if got.Nonce != want.Nonce {
		t.Fatalf("nonce mismatch: got %d want %d", got.Nonce, want.Nonce)
	}
	if got.Status != want.Status {
		t.Fatalf("status mismatch: got %d want %d", got.Status, want.Status)
	}
}

func TestDecodeRootStakePayloadRejectsInvalidStatus(t *testing.T) {
	payload, err := EncodeRootStakePayload(RootStakePayload{
		ValidatorID: 1,
		Signer:      common.HexToAddress("0x1"),
		Amount:      big.NewInt(1),
		Nonce:       1,
		Status:      9,
	})
	if err == nil {
		t.Fatalf("expected encode failure for invalid status, got payload %x", payload)
	}
}
