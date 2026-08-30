package parlia

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/consensus"
	"github.com/ethereum/go-ethereum/core"
	"github.com/ethereum/go-ethereum/core/systemcontracts"
	"github.com/ethereum/go-ethereum/core/tracing"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/core/vm"
	"github.com/ethereum/go-ethereum/log"
	"github.com/ethereum/go-ethereum/rlp"
)

const stateSyncFetchLimit = 50

var stateReceiverABIJSON = `[{"constant":true,"inputs":[],"name":"lastStateId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"syncTime","type":"uint256"},{"internalType":"bytes","name":"recordBytes","type":"bytes"}],"name":"commitState","outputs":[{"internalType":"bool","name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}]`

type stateSyncEventRecord struct {
	ID       uint64
	Contract common.Address
	Data     []byte
	TxHash   common.Hash
	LogIndex uint64
	ChainID  string
	Time     time.Time
}

type heimdallRecordListResponse struct {
	EventRecords []heimdallEventRecord `json:"event_records"`
}

type heimdallEventRecord struct {
	ID         uint64    `json:"id,string"`
	Contract   string    `json:"contract"`
	Data       []byte    `json:"data"`
	TxHash     string    `json:"tx_hash"`
	LogIndex   uint64    `json:"log_index,string"`
	BorChainID string    `json:"bor_chain_id"`
	RecordTime time.Time `json:"record_time"`
}

type stateSyncRLPRecord struct {
	ID       uint64
	Contract common.Address
	Data     []byte
	TxHash   common.Hash
	LogIndex uint64
	ChainID  string
}

func (p *Parlia) bridgeStateReceiver() common.Address {
	if strings.TrimSpace(p.bridge.StateReceiverContract) != "" {
		return common.HexToAddress(p.bridge.StateReceiverContract)
	}
	return common.HexToAddress(systemcontracts.StateReceiverContract)
}

func (p *Parlia) bridgeEnabled() bool {
	return strings.TrimSpace(p.bridge.HeimdallURL) != ""
}

func (p *Parlia) bridgeStateSyncTimeout() time.Duration {
	if p.bridge.StateSyncTimeout > 0 {
		return p.bridge.StateSyncTimeout
	}
	return time.Minute
}

func (p *Parlia) bridgeStateSyncDelay() time.Duration {
	if p.bridge.StateSyncDelay > 0 {
		return p.bridge.StateSyncDelay
	}
	return 0
}

func (p *Parlia) bridgeLastStateID(state vm.StateDB, header *types.Header, chain core.ChainContext, tracer *tracing.Hooks) (uint64, error) {
	stateReceiverABI, err := abi.JSON(strings.NewReader(stateReceiverABIJSON))
	if err != nil {
		return 0, err
	}
	data, err := stateReceiverABI.Pack("lastStateId")
	if err != nil {
		return 0, err
	}
	blockContext := core.NewEVMBlockContext(header, chain, nil)
	evm := vm.NewEVM(blockContext, state, p.chainConfig, vm.Config{Tracer: tracer})
	ret, _, err := evm.StaticCall(consensus.SystemAddress, p.bridgeStateReceiver(), data, math.MaxUint64/2)
	if err != nil {
		return 0, err
	}
	values, err := stateReceiverABI.Unpack("lastStateId", ret)
	if err != nil {
		return 0, err
	}
	if len(values) != 1 {
		return 0, fmt.Errorf("unexpected lastStateId return count: %d", len(values))
	}
	lastStateID, ok := values[0].(*big.Int)
	if !ok {
		return 0, fmt.Errorf("unexpected lastStateId return type: %T", values[0])
	}
	return lastStateID.Uint64(), nil
}

func (p *Parlia) stateSyncURL(fromID uint64, to time.Time) (*url.URL, error) {
	base, err := url.Parse(strings.TrimSpace(p.bridge.HeimdallURL))
	if err != nil {
		return nil, err
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/clerk/time"
	query := base.Query()
	query.Set("from_id", fmt.Sprintf("%d", fromID))
	query.Set("to_time", to.UTC().Format(time.RFC3339))
	query.Set("pagination.limit", fmt.Sprintf("%d", stateSyncFetchLimit))
	base.RawQuery = query.Encode()
	return base, nil
}

func (p *Parlia) fetchStateSyncEvents(ctx context.Context, fromID uint64, to time.Time) ([]*stateSyncEventRecord, error) {
	events := make([]*stateSyncEventRecord, 0)
	client := http.Client{Timeout: p.bridgeStateSyncTimeout()}
	cursor := fromID
	for {
		reqURL, err := p.stateSyncURL(cursor, to)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL.String(), nil)
		if err != nil {
			return nil, err
		}
		res, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		func() {
			defer res.Body.Close()
			if res.StatusCode < 200 || res.StatusCode >= 300 {
				err = fmt.Errorf("heimdall returned %d", res.StatusCode)
				return
			}
			var payload heimdallRecordListResponse
			if decodeErr := json.NewDecoder(res.Body).Decode(&payload); decodeErr != nil {
				err = decodeErr
				return
			}
			for _, event := range payload.EventRecords {
				if event.ID < cursor || !event.RecordTime.Before(to) {
					continue
				}
				events = append(events, &stateSyncEventRecord{
					ID:       event.ID,
					Contract: common.HexToAddress(event.Contract),
					Data:     event.Data,
					TxHash:   common.HexToHash(event.TxHash),
					LogIndex: event.LogIndex,
					ChainID:  event.BorChainID,
					Time:     event.RecordTime,
				})
			}
			if len(payload.EventRecords) < stateSyncFetchLimit {
				cursor = 0
				return
			}
			cursor += stateSyncFetchLimit
		}()
		if err != nil {
			return nil, err
		}
		if cursor == 0 {
			break
		}
	}
	sort.SliceStable(events, func(i, j int) bool {
		return events[i].ID < events[j].ID
	})
	return events, nil
}

func freezeStateSyncFetchError(err error, hasReceivedStateSyncTx bool) error {
	if err == nil {
		return nil
	}
	if hasReceivedStateSyncTx {
		return errors.New("unexpected state sync tx while state sync fetch failed")
	}
	return nil
}

func validateStateSyncEvent(event *stateSyncEventRecord, lastStateID uint64, to time.Time, chainID string) error {
	if lastStateID+1 != event.ID {
		return fmt.Errorf("non-sequential state sync id: got %d want %d", event.ID, lastStateID+1)
	}
	if event.ChainID != chainID {
		return fmt.Errorf("wrong state sync chain id: got %s want %s", event.ChainID, chainID)
	}
	if !event.Time.Before(to) {
		return fmt.Errorf("state sync time %s is not before %s", event.Time.Format(time.RFC3339), to.Format(time.RFC3339))
	}
	return nil
}

func (p *Parlia) commitStateSyncs(
	state vm.StateDB,
	header *types.Header,
	chain core.ChainContext,
	txs *[]*types.Transaction,
	receipts *[]*types.Receipt,
	receivedTxs *[]*types.Transaction,
	mining bool,
	tracer *tracing.Hooks,
) error {
	hasReceivedStateSyncTx := receivedTxs != nil && len(*receivedTxs) > 0 && (*receivedTxs)[0] != nil && (*receivedTxs)[0].Type() == types.StateSyncTxType
	if !p.bridgeEnabled() {
		if hasReceivedStateSyncTx {
			return errors.New("unexpected state sync tx while bridge is disabled")
		}
		return nil
	}

	lastStateID, err := p.bridgeLastStateID(state, header, chain, tracer)
	if err != nil {
		return err
	}
	cutoff := time.Unix(int64(header.Time), 0).Add(-p.bridgeStateSyncDelay())
	ctx, cancel := context.WithTimeout(context.Background(), p.bridgeStateSyncTimeout())
	defer cancel()

	log.Info("Fetching bridge state sync events", "fromID", lastStateID+1, "to", cutoff.Format(time.RFC3339))
	events, err := p.fetchStateSyncEvents(ctx, lastStateID+1, cutoff)
	if err != nil {
		log.Warn("Bridge state sync fetch failed; freezing root stake updates at last snapshot", "err", err)
		return freezeStateSyncFetchError(err, hasReceivedStateSyncTx)
	}
	if len(events) == 0 {
		if hasReceivedStateSyncTx {
			return errors.New("unexpected state sync tx without state sync events")
		}
		return nil
	}

	stateSyncData := make([]*types.StateSyncData, 0, len(events))
	for _, event := range events {
		if err := validateStateSyncEvent(event, lastStateID, cutoff, p.chainConfig.ChainID.String()); err != nil {
			return err
		}
		stateSyncData = append(stateSyncData, &types.StateSyncData{
			ID:       event.ID,
			Contract: event.Contract,
			Data:     event.Data,
			TxHash:   event.TxHash,
		})
		lastStateID++
	}

	expectedTx := types.NewTx(&types.StateSyncTx{StateSyncData: stateSyncData})
	if mining {
		*txs = append(*txs, expectedTx)
	} else {
		if !hasReceivedStateSyncTx {
			return errors.New("missing state sync tx")
		}
		actualTx := (*receivedTxs)[0]
		if actualTx.Hash() != expectedTx.Hash() {
			return fmt.Errorf("state sync tx mismatch: got %s want %s", actualTx.Hash(), expectedTx.Hash())
		}
		expectedTx = actualTx
		*receivedTxs = (*receivedTxs)[1:]
		*txs = append(*txs, expectedTx)
	}

	txIndex := len(*txs) - 1
	state.SetTxContext(expectedTx.Hash(), txIndex)

	stateReceiverABI, err := abi.JSON(strings.NewReader(stateReceiverABIJSON))
	if err != nil {
		return err
	}
	blockContext := core.NewEVMBlockContext(header, chain, nil)
	for _, event := range events {
		recordBytes, err := rlp.EncodeToBytes(&stateSyncRLPRecord{
			ID:       event.ID,
			Contract: event.Contract,
			Data:     event.Data,
			TxHash:   event.TxHash,
			LogIndex: event.LogIndex,
			ChainID:  event.ChainID,
		})
		if err != nil {
			return err
		}
		data, err := stateReceiverABI.Pack("commitState", big.NewInt(event.Time.Unix()), recordBytes)
		if err != nil {
			return err
		}
		msg := &core.Message{
			From:                  consensus.SystemAddress,
			To:                    ptrAddress(p.bridgeStateReceiver()),
			GasLimit:              math.MaxUint64 / 2,
			GasPrice:              common.Big0,
			GasFeeCap:             common.Big0,
			GasTipCap:             common.Big0,
			Value:                 common.Big0,
			Data:                  data,
			SkipNonceChecks:       true,
			SkipTransactionChecks: true,
		}
		evm := vm.NewEVM(blockContext, state, p.chainConfig, vm.Config{Tracer: tracer})
		result, err := core.ApplyMessage(evm, msg, new(core.GasPool).AddGas(msg.GasLimit))
		if err != nil {
			return err
		}
		if result.Failed() {
			return result.Unwrap()
		}
		state.Finalise(true)
	}

	cumulativeGasUsed := header.GasUsed
	if len(*receipts) > 0 {
		cumulativeGasUsed = (*receipts)[len(*receipts)-1].CumulativeGasUsed
	}
	stateSyncReceipt := &types.Receipt{
		Type:              types.StateSyncTxType,
		Status:            types.ReceiptStatusSuccessful,
		CumulativeGasUsed: cumulativeGasUsed,
		TxHash:            expectedTx.Hash(),
		GasUsed:           0,
		Logs:              state.GetLogs(expectedTx.Hash(), header.Number.Uint64(), header.Hash(), header.Time),
		BlockHash:         header.Hash(),
		BlockNumber:       header.Number,
		TransactionIndex:  uint(txIndex),
	}
	stateSyncReceipt.Bloom = types.CreateBloom(stateSyncReceipt)
	*receipts = append(*receipts, stateSyncReceipt)
	log.Info("Committed bridge state sync events", "count", len(events), "txHash", expectedTx.Hash())
	return nil
}

func ptrAddress(addr common.Address) *common.Address {
	return &addr
}
