package parlia

import (
	"context"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

func Test_ATTACK_childContinuesOnWrongStake_fetchFailureFreezes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "stale snapshot", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	engine := &Parlia{
		bridge: BridgeConfig{
			HeimdallURL:      server.URL,
			StateSyncTimeout: 2 * time.Second,
		},
	}

	_, err := engine.fetchStateSyncEvents(context.Background(), 1, time.Now())
	if err == nil {
		t.Fatal("expected fetch failure simulating divergent root snapshot")
	}

	frozenErr := freezeStateSyncFetchError(err, false)
	if frozenErr != nil {
		t.Fatalf("child must freeze on fetch failure, not advance on wrong stake: %v", frozenErr)
	}
}

func Test_ATTACK_wrongRootStakePayload_rejectedByDecoder(t *testing.T) {
	payload, err := EncodeRootStakePayload(RootStakePayload{
		ValidatorID: 1,
		Signer:      common.HexToAddress("0x1"),
		Amount:      big.NewInt(1),
		Nonce:       1,
		Status:      99,
	})
	if err == nil {
		t.Fatalf("invalid status must not decode as valid root stake: %x", payload)
	}
}

func Test_ATTACK_stateSyncWithFetchFailure_blocksWhenTxPresent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "divergence", http.StatusInternalServerError)
	}))
	defer server.Close()

	engine := &Parlia{
		bridge: BridgeConfig{
			HeimdallURL:      server.URL,
			StateSyncTimeout: 2 * time.Second,
		},
	}

	_, err := engine.fetchStateSyncEvents(context.Background(), 1, time.Now())
	if err == nil {
		t.Fatal("expected fetch error")
	}

	withTxErr := freezeStateSyncFetchError(err, true)
	if withTxErr == nil {
		t.Fatal("must not commit divergent state sync tx when fetch fails")
	}
}

func Test_ATTACK_commitStateSyncsDisabled_noDrift(t *testing.T) {
	engine := &Parlia{bridge: BridgeConfig{}}
	header := &types.Header{Number: common.Big1, Time: uint64(time.Now().Unix())}
	var txs []*types.Transaction
	var receipts []*types.Receipt

	err := engine.commitStateSyncs(nil, header, nil, &txs, &receipts, nil, false, nil)
	if err != nil {
		t.Fatalf("disabled bridge must not error: %v", err)
	}
	if len(txs) != 0 {
		t.Fatalf("disabled bridge must not emit state sync txs: got %d", len(txs))
	}
}
