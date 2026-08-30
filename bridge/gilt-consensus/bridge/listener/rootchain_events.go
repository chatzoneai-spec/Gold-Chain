package listener

import (
	"github.com/ethereum/go-ethereum/accounts/abi"
	ethCommon "github.com/ethereum/go-ethereum/common"

	"github.com/giltchain/gilt-consensus/helper"
)

var supportedRootChainEvents = map[string]struct{}{
	helper.NewHeaderBlockEvent: {},
	helper.StateSyncedEvent:    {},
	helper.TopUpFeeEvent:       {},
	helper.SlashedEvent:        {},
	helper.UnJailedEvent:       {},
	helper.StakedEvent:         {},
	helper.UnstakeInitEvent:    {},
	helper.UnstakedEvent:       {},
	helper.SignerChangeEvent:   {},
	helper.StakeUpdateEvent:    {},
	helper.RestakedEvent:       {},
	helper.ShareMintedEvent:    {},
	helper.ShareBurnedEvent:    {},
}

func isSupportedRootChainEvent(eventName string) bool {
	_, ok := supportedRootChainEvents[eventName]
	return ok
}

func (rl *RootChainListener) supportedRootEventByTopic(topic []byte) *abi.Event {
	for _, abiObject := range rl.abis {
		selectedEvent := helper.EventByID(abiObject, topic)
		if selectedEvent == nil || !isSupportedRootChainEvent(selectedEvent.Name) {
			continue
		}

		return selectedEvent
	}

	return nil
}

func (rl *RootChainListener) supportedRootEventTopics() []ethCommon.Hash {
	topics := make([]ethCommon.Hash, 0, len(supportedRootChainEvents))
	for _, abiObject := range rl.abis {
		for eventName := range supportedRootChainEvents {
			event, ok := abiObject.Events[eventName]
			if !ok {
				continue
			}

			topics = append(topics, event.ID)
		}
	}

	return topics
}
