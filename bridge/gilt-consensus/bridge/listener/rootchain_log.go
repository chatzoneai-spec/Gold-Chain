package listener

import (
	"bytes"
	"encoding/json"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/core/types"

	"github.com/giltchain/gilt-consensus/bridge/util"
	"github.com/giltchain/gilt-consensus/contracts/stakinginfo"
	"github.com/giltchain/gilt-consensus/contracts/statesender"
	"github.com/giltchain/gilt-consensus/helper"
)

const (
	failedToMarshalLog    = "RootChainListener: failed to marshal log"
	failedToParseEventLog = "RootChainListener: error while parsing event"
)

// handleLog handles the given log
func (rl *RootChainListener) handleLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.Logger.Debug("RootChainListener: receivedEvent", "eventName", selectedEvent.Name)

	switch selectedEvent.Name {
	case helper.NewHeaderBlockEvent:
		rl.handleNewHeaderBlockLog(vLog, selectedEvent)
	case helper.StateSyncedEvent:
		rl.handleStateSyncedLog(vLog, selectedEvent)
	case helper.TopUpFeeEvent:
		rl.handleTopUpFeeLog(vLog, selectedEvent)
	case helper.SlashedEvent:
		rl.handleSlashedLog(vLog, selectedEvent)
	case helper.UnJailedEvent:
		rl.handleUnJailedLog(vLog, selectedEvent)
	case helper.StakedEvent:
		rl.handleStakedLog(vLog, selectedEvent)
	case helper.UnstakeInitEvent:
		rl.handleUnstakeInitLog(vLog, selectedEvent)
	case helper.UnstakedEvent:
		rl.handleUnstakedLog(vLog, selectedEvent)
	case helper.SignerChangeEvent:
		rl.handleSignerChangeLog(vLog, selectedEvent)
	case helper.StakeUpdateEvent:
		rl.handleStakeUpdateLog(vLog, selectedEvent)
	case helper.RestakedEvent:
		rl.handleRestakedLog(vLog, selectedEvent)
	case helper.ShareMintedEvent:
		rl.handleShareMintedLog(vLog, selectedEvent)
	case helper.ShareBurnedEvent:
		rl.handleShareBurnedLog(vLog, selectedEvent)
	}
}

func (rl *RootChainListener) handleNewHeaderBlockLog(vLog types.Log, selectedEvent *abi.Event) {
	logBytes, err := json.Marshal(vLog)
	if err != nil {
		rl.Logger.Error(failedToMarshalLog, "error", err)
	}

	if isCurrentValidator, delay := util.CalculateTaskDelay(selectedEvent, rl.cliCtx.Codec); isCurrentValidator {
		rl.SendTaskWithDelay("sendCheckpointAckToGiltConsensus", selectedEvent.Name, logBytes, delay, selectedEvent)
	}
}

func (rl *RootChainListener) handleStateSyncedLog(vLog types.Log, selectedEvent *abi.Event) {
	logBytes, err := json.Marshal(vLog)
	if err != nil {
		rl.Logger.Error(failedToMarshalLog, "Error", err)
	}

	event := new(statesender.StatesenderStateSynced)
	if err = helper.UnpackLog(rl.stateSenderAbi, event, selectedEvent.Name, &vLog); err != nil {
		rl.Logger.Error(failedToParseEventLog, "name", selectedEvent.Name, "error", err)
	}

	rl.Logger.Info("RootChainListener: StateSyncedEvent detected", "stateSyncId", event.Id)

	if isCurrentValidator, delay := util.CalculateTaskDelay(event, rl.cliCtx.Codec); isCurrentValidator {
		rl.SendTaskWithDelay("sendStateSyncedToGiltConsensus", selectedEvent.Name, logBytes, delay, event)
	}
}

func (rl *RootChainListener) handleTopUpFeeLog(vLog types.Log, selectedEvent *abi.Event) {
	logBytes, err := json.Marshal(vLog)
	if err != nil {
		rl.Logger.Error(failedToMarshalLog, "Error", err)
	}

	event := new(stakinginfo.StakinginfoTopUpFee)
	if err = helper.UnpackLog(rl.stakingInfoAbi, event, selectedEvent.Name, &vLog); err != nil {
		rl.Logger.Error("RootChainListener: error while parsing event", "name", selectedEvent.Name, "error", err)
	}

	if bytes.Equal(event.User.Bytes(), helper.GetAddress()) {
		rl.SendTaskWithDelay("sendTopUpFeeToGiltConsensus", selectedEvent.Name, logBytes, 0, event)
	} else if isCurrentValidator, delay := util.CalculateTaskDelay(event, rl.cliCtx.Codec); isCurrentValidator {
		rl.SendTaskWithDelay("sendTopUpFeeToGiltConsensus", selectedEvent.Name, logBytes, delay, event)
	}
}

func (rl *RootChainListener) handleSlashedLog(vLog types.Log, selectedEvent *abi.Event) {
	logBytes, err := json.Marshal(vLog)
	if err != nil {
		rl.Logger.Error(failedToMarshalLog, "Error", err)
	}

	if isCurrentValidator, delay := util.CalculateTaskDelay(selectedEvent, rl.cliCtx.Codec); isCurrentValidator {
		rl.SendTaskWithDelay("sendTickAckToGiltConsensus", selectedEvent.Name, logBytes, delay, selectedEvent)
	}
}

func (rl *RootChainListener) handleUnJailedLog(vLog types.Log, selectedEvent *abi.Event) {
	logBytes, err := json.Marshal(vLog)
	if err != nil {
		rl.Logger.Error(failedToMarshalLog, "Error", err)
	}

	event := new(stakinginfo.StakinginfoUnJailed)
	if err = helper.UnpackLog(rl.stakingInfoAbi, event, selectedEvent.Name, &vLog); err != nil {
		rl.Logger.Error("RootChainListener: error while parsing event", "name", selectedEvent.Name, "error", err)
	}

	if util.IsEventSender(event.ValidatorId.Uint64(), rl.cliCtx.Codec) {
		rl.SendTaskWithDelay("sendUnjailToGiltConsensus", selectedEvent.Name, logBytes, 0, event)
	} else if isCurrentValidator, delay := util.CalculateTaskDelay(event, rl.cliCtx.Codec); isCurrentValidator {
		rl.SendTaskWithDelay("sendUnjailToGiltConsensus", selectedEvent.Name, logBytes, delay, event)
	}
}

func (rl *RootChainListener) handleStakedLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendStakedToGiltConsensus", new(stakinginfo.StakinginfoStaked))
}

func (rl *RootChainListener) handleUnstakeInitLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendUnstakeInitToGiltConsensus", new(stakinginfo.StakinginfoUnstakeInit))
}

func (rl *RootChainListener) handleUnstakedLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendUnstakedToGiltConsensus", new(stakinginfo.StakinginfoUnstaked))
}

func (rl *RootChainListener) handleSignerChangeLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendSignerChangeToGiltConsensus", new(stakinginfo.StakinginfoSignerChange))
}

func (rl *RootChainListener) handleStakeUpdateLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendStakeUpdateToGiltConsensus", new(stakinginfo.StakinginfoStakeUpdate))
}

func (rl *RootChainListener) handleRestakedLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendRestakedToGiltConsensus", new(stakinginfo.StakinginfoRestaked))
}

func (rl *RootChainListener) handleShareMintedLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendShareMintedToGiltConsensus", new(stakinginfo.StakinginfoShareMinted))
}

func (rl *RootChainListener) handleShareBurnedLog(vLog types.Log, selectedEvent *abi.Event) {
	rl.handleRootStakeLog(vLog, selectedEvent, "sendShareBurnedToGiltConsensus", new(stakinginfo.StakinginfoShareBurned))
}

func (rl *RootChainListener) handleRootStakeLog(vLog types.Log, selectedEvent *abi.Event, taskName string, event interface{}) {
	if !helper.IsRootAnchoredStakeReadEnabled() {
		rl.Logger.Warn("RootChainListener: root-anchored stake read disabled; skipping event", "event", selectedEvent.Name)
		return
	}

	logBytes, err := json.Marshal(vLog)
	if err != nil {
		rl.Logger.Error(failedToMarshalLog, "Error", err)
		return
	}

	if err = helper.UnpackLog(rl.stakingInfoAbi, event, selectedEvent.Name, &vLog); err != nil {
		rl.Logger.Error(failedToParseEventLog, "name", selectedEvent.Name, "error", err)
		return
	}

	if isCurrentValidator, delay := util.CalculateTaskDelay(event, rl.cliCtx.Codec); isCurrentValidator {
		rl.SendTaskWithDelay(taskName, selectedEvent.Name, logBytes, delay, event)
	}
}
