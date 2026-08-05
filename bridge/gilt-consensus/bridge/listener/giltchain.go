package listener

import (
	"context"
	"math/big"
	"time"

	"github.com/RichardKnop/machinery/v1/tasks"

	"github.com/giltchain/gilt-consensus/helper"
)

// GiltChainListener - Listens to and processes headerBlocks from the gilt chain
type GiltChainListener struct {
	BaseListener
}

// Start starts new block subscription
func (ml *GiltChainListener) Start() error {
	ml.Logger.Info("GiltChainListener: starting")

	// create cancellable context
	ctx, cancelSubscription := context.WithCancel(context.Background())
	ml.cancelSubscription = cancelSubscription

	// create cancellable context
	headerCtx, cancelHeaderProcess := context.WithCancel(context.Background())
	ml.cancelHeaderProcess = cancelHeaderProcess

	// start the header process
	go ml.StartHeaderProcess(headerCtx)

	// start go routine to poll for the Parlia finalized header using the client object
	ml.Logger.Info("GiltChainListener: start polling for Parlia finalized header blocks", "pollInterval", helper.GetConfig().CheckpointPollInterval)

	go ml.StartPolling(ctx, helper.GetConfig().CheckpointPollInterval, nil)

	return nil
}

// StartPolling polls the Parlia finalized head; non-finalized tips are not checkpoint-eligible.
func (ml *GiltChainListener) StartPolling(ctx context.Context, pollInterval time.Duration, _ *big.Int) {
	ticker := time.NewTicker(pollInterval)

	for {
		select {
		case <-ticker.C:
			header, err := ml.contractCaller.GetGiltChainFinalizedBlock(ctx)
			if err != nil {
				ml.Logger.Error("GiltChainListener: error fetching Parlia finalized header", "err", err)
				continue
			}
			if header == nil {
				continue
			}

			ml.HeaderChannel <- &blockHeader{header: header, isFinalized: true}
		case <-ctx.Done():
			ml.Logger.Info("GiltChainListener: polling stopped")
			ticker.Stop()

			return
		}
	}
}

// ProcessHeader - process header block from the gilt chain
func (ml *GiltChainListener) ProcessHeader(newHeader *blockHeader) {
	ml.Logger.Debug("GiltChainListener: new header block detected", "blockNumber", newHeader.header.Number)

	// Marshall header block and publish to queue
	headerBytes, err := newHeader.header.MarshalJSON()
	if err != nil {
		ml.Logger.Error("GiltChainListener: error marshalling header block", "error", err)
		return
	}

	ml.sendTaskWithDelay("sendCheckpointToGiltConsensus", headerBytes, 0)
}

func (ml *GiltChainListener) sendTaskWithDelay(taskName string, headerBytes []byte, delay time.Duration) {
	// create the machinery task
	signature := &tasks.Signature{
		Name: taskName,
		Args: []tasks.Arg{
			{
				Type:  "string",
				Value: string(headerBytes),
			},
		},
	}
	signature.RetryCount = 3

	// add delay for the task so that multiple validators won't send same transaction at same time
	eta := time.Now().Add(delay)
	signature.ETA = &eta

	ml.Logger.Debug("GiltChainListener: sending task", "taskName", taskName, "currentTime", time.Now(), "delayTime", eta)

	_, err := ml.queueConnector.Server.SendTask(signature)
	if err != nil {
		ml.Logger.Error("GiltChainListener: error sending task", "taskName", taskName, "error", err)
	}
}
