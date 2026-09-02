package listener

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"strconv"
	"time"

	"github.com/RichardKnop/machinery/v1/tasks"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/giltchain/gilt-consensus/helper"
	checkpointTypes "github.com/giltchain/gilt-consensus/x/checkpoint/types"
)

const giltconsensusLastBlockKey = "giltconsensus-last-block" // storage key

// GiltConsensusListener - Listens to and process events from giltconsensus
type GiltConsensusListener struct {
	BaseListener
}

// Start starts new block subscription
func (hl *GiltConsensusListener) Start() error {
	hl.Logger.Info("GiltConsensusListener: starting")

	// create cancellable context
	headerCtx, cancelHeaderProcess := context.WithCancel(context.Background())
	hl.cancelHeaderProcess = cancelHeaderProcess

	// GiltConsensus pollInterval = (minimal pollInterval of root chain and gilt chain)
	pollInterval := helper.GetConfig().SyncerPollInterval
	if helper.GetConfig().CheckpointPollInterval < helper.GetConfig().SyncerPollInterval {
		pollInterval = helper.GetConfig().CheckpointPollInterval
	}

	hl.Logger.Info("GiltConsensusListener: start polling for events", "pollInterval", pollInterval)
	hl.StartPolling(headerCtx, pollInterval, nil)

	return nil
}

// Stop stops the giltconsensus listener
func (hl *GiltConsensusListener) Stop() {
	hl.Logger.Info("GiltConsensusListener: stopping")

	// cancel subscription if any, and clean up reference
	if hl.cancelSubscription != nil {
		hl.cancelSubscription()
		hl.cancelSubscription = nil
	}

	// cancel header processing if any, and clean up reference
	if hl.cancelHeaderProcess != nil {
		hl.cancelHeaderProcess()
		hl.cancelHeaderProcess = nil
	}

	hl.Logger.Info("GiltConsensusListener: stopped")
}

// ProcessHeader -
func (hl *GiltConsensusListener) ProcessHeader(_ *blockHeader) {
}

// StartPolling - starts polling for giltconsensus events
func (hl *GiltConsensusListener) StartPolling(ctx context.Context, pollInterval time.Duration, _ *big.Int) {
	// How often to fire the passed in function in second
	interval := pollInterval

	// Set up the ticket and the channel to signal
	// the ending of the interval
	ticker := time.NewTicker(interval)

	// start listening
	for {
		select {
		case <-ticker.C:
			fromBlock, toBlock, err := hl.fetchFromAndToBlock(ctx)
			if err != nil {
				hl.Logger.Error("GiltConsensusListener: error fetching from and to block, skipping events query", "fromBlock", fromBlock, "toBlock", toBlock, "error", err)
				continue
			} else if fromBlock < toBlock {
				hl.Logger.Debug("GiltConsensusListener: fetching new events between blocks", "fromBlock", fromBlock, "toBlock", toBlock)

				// Querying and processing Begin events
				for i := fromBlock; i <= toBlock; i++ {
					// Early context check to ensure a graceful shutdown
					select {
					case <-ctx.Done():
						hl.Logger.Info("GiltConsensusListener: polling stopped during event fetch loop")
						ticker.Stop()
						return
					default:
					}
					events, err := helper.GetBeginBlockEvents(ctx, hl.httpClient, int64(i))
					if err != nil {
						hl.Logger.Error("GiltConsensusListener: error fetching begin block events", "error", err)
						continue
					}
					for _, event := range events {
						hl.ProcessBlockEvent(sdk.StringifyEvent(event), int64(i))
					}
				}
				// store last block processed
				if err := hl.storageClient.Put([]byte(giltconsensusLastBlockKey), []byte(strconv.FormatUint(toBlock, 10)), nil); err != nil {
					hl.Logger.Error("GiltConsensusListener: hl.storageClient.Put", "Error", err)
				}
			}

		case <-ctx.Done():
			hl.Logger.Info("GiltConsensusListener: polling stopped")
			ticker.Stop()
			return
		}
	}
}

func (hl *GiltConsensusListener) fetchFromAndToBlock(ctx context.Context) (uint64, uint64, error) {
	nodeStatus, err := helper.GetNodeStatus(ctx, hl.cliCtx)
	if err != nil {
		hl.Logger.Error("GiltConsensusListener: error while fetching giltconsensus node status", "error", err)
		return 0, 0, err
	}

	chainId := hl.cliCtx.ChainID
	if chainId == "" {
		// If chainId is not set in cliCtx, fetch it from node status.
		// It should not happen because chainId is set in cliCtx during bridge initialization.
		hl.Logger.Debug("GiltConsensusListener: chainID is empty in cliCtx")
		if nodeStatus.NodeInfo.Network == "" {
			return 0, 0, errors.New("network is empty in node status; cannot determine initial fromBlock")
		}
		chainId = nodeStatus.NodeInfo.Network
	}

	// fromBlock - get the initial block height from config
	fromBlock := helper.GetInitialBlockHeight(chainId)
	// fromBlock - get last block from storage
	hasLastBlock, _ := hl.storageClient.Has([]byte(giltconsensusLastBlockKey), nil)
	if hasLastBlock {
		lastBlockBytes, err := hl.storageClient.Get([]byte(giltconsensusLastBlockKey), nil)
		if err != nil {
			hl.Logger.Info("GiltConsensusListener: error while fetching last block bytes from storage", "error", err)
			return 0, 0, err
		}

		result, err := strconv.ParseUint(string(lastBlockBytes), 10, 64)
		if err != nil {
			hl.Logger.Info("GiltConsensusListener: error parsing last block bytes from storage", "error", err)
			return 0, 0, err
		}

		hl.Logger.Debug("GiltConsensusListener: got last block from bridge storage", "lastBlock", result)
		if result >= fromBlock {
			hl.Logger.Debug("GiltConsensusListener: overriding fromBlock using last processed block from storage", "oldFromBlock", fromBlock, "lastProcessedBlock", result, "newFromBlock", result+1)
			fromBlock = result + 1
		}
	}

	// Clamp fromBlock to the node's earliest available block (this handles pruned snapshots)
	earliestBlock := uint64(nodeStatus.SyncInfo.EarliestBlockHeight)
	if earliestBlock > 0 && fromBlock < earliestBlock {
		hl.Logger.Info("GiltConsensusListener: fromBlock is before the node's earliest available block, skipping ahead",
			"fromBlock", fromBlock, "earliestBlock", earliestBlock)
		fromBlock = earliestBlock
	}

	// toBlock - get the latest block height from giltconsensus node
	toBlock := uint64(nodeStatus.SyncInfo.LatestBlockHeight)
	if toBlock <= fromBlock {
		toBlock = fromBlock + 1
	}

	return fromBlock, toBlock, err
}

// ProcessBlockEvent - process the block events (BeginBlock, EndBlock events) from giltconsensus.
func (hl *GiltConsensusListener) ProcessBlockEvent(event sdk.StringEvent, blockHeight int64) {
	hl.Logger.Debug("GiltConsensusListener: received block event from GiltConsensus", "eventType", event.Type)

	eventBytes, err := json.Marshal(event)
	if err != nil {
		hl.Logger.Error("GiltConsensusListener: error while marshalling block event", "eventType", event.Type, "error", err)
		return
	}

	switch event.Type {
	case checkpointTypes.EventTypeCheckpoint:
		hl.sendBlockTask("sendCheckpointToRootchain", eventBytes, blockHeight)
	default:
		hl.Logger.Debug("GiltConsensusListener: block event type mismatch", "eventType", event.Type)
	}
}

func (hl *GiltConsensusListener) sendBlockTask(taskName string, eventBytes []byte, blockHeight int64) {
	// create the machinery task
	signature := &tasks.Signature{
		Name: taskName,
		Args: []tasks.Arg{
			{
				Type:  "string",
				Value: string(eventBytes),
			},
			{
				Type:  "int64",
				Value: blockHeight,
			},
		},
	}
	signature.RetryCount = 3

	hl.Logger.Debug("GiltConsensusListener: sending block level task", "taskName", taskName, "currentTime", time.Now(), "blockHeight", blockHeight)

	// send the task
	_, err := hl.queueConnector.Server.SendTask(signature)
	if err != nil {
		hl.Logger.Error("GiltConsensusListener: error sending block level task", "taskName", taskName, "blockHeight", blockHeight, "error", err)
	}
}
