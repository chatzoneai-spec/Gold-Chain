package parlia

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/systemcontracts"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/core/vm"
)

func TestCommitStateSyncsBridgeDisabledIsNoOp(t *testing.T) {
	engine := &Parlia{
		bridge: BridgeConfig{},
	}
	header := &types.Header{
		Number: common.Big1,
		Time:   uint64(time.Now().Unix()),
	}
	state := vm.StateDB(nil)
	var txs []*types.Transaction
	var receipts []*types.Receipt

	err := engine.commitStateSyncs(state, header, nil, &txs, &receipts, nil, false, nil)
	if err != nil {
		t.Fatalf("commitStateSyncs with disabled bridge returned error: %v", err)
	}
	if len(txs) != 0 {
		t.Fatalf("expected no txs when bridge disabled, got %d", len(txs))
	}
}

func TestStateSyncFetchFailureFreezePolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream unavailable", http.StatusServiceUnavailable)
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

	// commitStateSyncs must treat fetch errors as freeze (nil), not block production.
	frozenErr := freezeStateSyncFetchError(err, false)
	if frozenErr != nil {
		t.Fatalf("fetch failure should freeze last-known-good snapshot, got %v", frozenErr)
	}

	withTxErr := freezeStateSyncFetchError(err, true)
	if withTxErr == nil {
		t.Fatal("expected error when state sync tx present but fetch failed")
	}
}

func TestBridgeStateReceiverDefaultsToSystemContract(t *testing.T) {
	engine := &Parlia{bridge: BridgeConfig{}}
	got := engine.bridgeStateReceiver()
	want := common.HexToAddress(systemcontracts.StateReceiverContract)
	if got != want {
		t.Fatalf("wrong state receiver: got %s want %s", got.Hex(), want.Hex())
	}
}
