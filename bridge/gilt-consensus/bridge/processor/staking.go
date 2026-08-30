package processor

import (
	"context"
	"encoding/json"
	"fmt"

	"cosmossdk.io/math"
	abci "github.com/cometbft/cometbft/abci/types"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	"github.com/cosmos/cosmos-sdk/types"
	"github.com/ethereum/go-ethereum/accounts/abi"
	ethTypes "github.com/ethereum/go-ethereum/core/types"

	"github.com/giltchain/gilt-consensus/bridge/util"
	"github.com/giltchain/gilt-consensus/contracts/stakinginfo"
	"github.com/giltchain/gilt-consensus/helper"
	stakeTypes "github.com/giltchain/gilt-consensus/x/stake/types"
)

const (
	errMsgStakingUnmarshallingEvent = "StakingProcessor: error while unmarshalling event from rootChain"
	errMsgStakingParsingEvent       = "StakingProcessor: error while parsing event"
	errMsgStakingBroadcasting       = "StakingProcessor: error while broadcasting stake msg to giltconsensus"
	errMsgStakingTxFailed           = "StakingProcessor: stake tx failed on giltconsensus"
)

// StakingProcessor applies finalized root StakingInfo events to gilt-consensus.
type StakingProcessor struct {
	BaseProcessor
	stakingInfoAbi *abi.ABI
}

// NewStakingProcessor creates a root stake processor.
func NewStakingProcessor(stakingInfoAbi *abi.ABI) *StakingProcessor {
	return &StakingProcessor{stakingInfoAbi: stakingInfoAbi}
}

// Start starts the staking processor.
func (sp *StakingProcessor) Start() error {
	sp.Logger.Info("StakingProcessor: starting")
	return nil
}

// RegisterTasks registers root stake machinery tasks.
func (sp *StakingProcessor) RegisterTasks() {
	sp.Logger.Info("StakingProcessor: registering root stake tasks")
	tasks := map[string]interface{}{
		"sendStakedToGiltConsensus":       sp.sendStakedToGiltConsensus,
		"sendUnstakeInitToGiltConsensus":  sp.sendUnstakeInitToGiltConsensus,
		"sendUnstakedToGiltConsensus":     sp.sendUnstakedToGiltConsensus,
		"sendSignerChangeToGiltConsensus": sp.sendSignerChangeToGiltConsensus,
		"sendStakeUpdateToGiltConsensus":  sp.sendStakeUpdateToGiltConsensus,
		"sendRestakedToGiltConsensus":     sp.sendRestakedToGiltConsensus,
		"sendShareMintedToGiltConsensus":  sp.sendShareMintedToGiltConsensus,
		"sendShareBurnedToGiltConsensus":  sp.sendShareBurnedToGiltConsensus,
	}
	for name, handler := range tasks {
		if err := sp.queueConnector.Server.RegisterTask(name, handler); err != nil {
			sp.Logger.Error("StakingProcessor: error registering task", "task", name, "error", err)
		}
	}
}

func (sp *StakingProcessor) sendStakedToGiltConsensus(eventName string, logBytes string) error {
	vLog, event, err := sp.unpackStakingEvent(eventName, logBytes, new(stakinginfo.StakinginfoStaked))
	if err != nil || event == nil {
		return err
	}
	staked := event.(*stakinginfo.StakinginfoStaked)
	pubKey := secp256k1.PubKey{Key: normalizeRootPubKey(staked.SignerPubkey)}

	msg, err := stakeTypes.NewMsgValidatorJoin(
		staked.Signer.Hex(),
		staked.ValidatorId.Uint64(),
		staked.ActivationEpoch.Uint64(),
		math.NewIntFromBigInt(staked.Amount),
		pubKey,
		staked.Nonce.Uint64(),
	)

	return sp.broadcastStakeMsg(msg, staked, vLog)
}

func (sp *StakingProcessor) sendUnstakeInitToGiltConsensus(eventName string, logBytes string) error {
	vLog, event, err := sp.unpackStakingEvent(eventName, logBytes, new(stakinginfo.StakinginfoUnstakeInit))
	if err != nil || event == nil {
		return err
	}
	unstakeInit := event.(*stakinginfo.StakinginfoUnstakeInit)

	msg, err := stakeTypes.NewMsgValidatorExitWithRootEpoch(
		unstakeInit.User.Hex(),
		unstakeInit.ValidatorId.Uint64(),
		unstakeInit.Nonce.Uint64(),
		unstakeInit.DeactivationEpoch.Uint64(),
	)
	if err != nil {
		return err
	}

	return sp.broadcastStakeMsg(msg, unstakeInit, vLog)
}

func (sp *StakingProcessor) sendUnstakedToGiltConsensus(eventName string, logBytes string) error {
	vLog, event, err := sp.unpackStakingEvent(eventName, logBytes, new(stakinginfo.StakinginfoUnstaked))
	if err != nil || event == nil {
		return err
	}
	unstaked := event.(*stakinginfo.StakinginfoUnstaked)

	nonce, err := util.GetValidatorNonce(unstaked.ValidatorId.Uint64(), sp.cliCtx.Codec)
	if err != nil {
		return err
	}

	msg, err := stakeTypes.NewMsgStakeUpdate(
		unstaked.User.Hex(),
		unstaked.ValidatorId.Uint64(),
		math.NewIntFromBigInt(unstaked.Total),
		nonce,
	)
	if err != nil {
		return err
	}

	return sp.broadcastStakeMsg(msg, unstaked, vLog)
}

func (sp *StakingProcessor) sendSignerChangeToGiltConsensus(eventName string, logBytes string) error {
	vLog, event, err := sp.unpackStakingEvent(eventName, logBytes, new(stakinginfo.StakinginfoSignerChange))
	if err != nil || event == nil {
		return err
	}
	signerChange := event.(*stakinginfo.StakinginfoSignerChange)

	msg, err := stakeTypes.NewMsgSignerUpdate(
		signerChange.OldSigner.Hex(),
		signerChange.ValidatorId.Uint64(),
		normalizeRootPubKey(signerChange.SignerPubkey),
		signerChange.Nonce.Uint64(),
	)
	if err != nil {
		return err
	}

	return sp.broadcastStakeMsg(msg, signerChange, vLog)
}

func (sp *StakingProcessor) sendStakeUpdateToGiltConsensus(eventName string, logBytes string) error {
	vLog, event, err := sp.unpackStakingEvent(eventName, logBytes, new(stakinginfo.StakinginfoStakeUpdate))
	if err != nil || event == nil {
		return err
	}
	stakeUpdate := event.(*stakinginfo.StakinginfoStakeUpdate)

	msg, err := stakeTypes.NewMsgStakeUpdate(
		helper.GetFromAddress(sp.cliCtx),
		stakeUpdate.ValidatorId.Uint64(),
		math.NewIntFromBigInt(stakeUpdate.NewAmount),
		stakeUpdate.Nonce.Uint64(),
	)
	if err != nil {
		return err
	}

	return sp.broadcastStakeMsg(msg, stakeUpdate, vLog)
}

func (sp *StakingProcessor) sendRestakedToGiltConsensus(eventName string, logBytes string) error {
	vLog, event, err := sp.unpackStakingEvent(eventName, logBytes, new(stakinginfo.StakinginfoRestaked))
	if err != nil || event == nil {
		return err
	}
	restaked := event.(*stakinginfo.StakinginfoRestaked)

	nonce, err := sp.nextRootStakeNonce(restaked.ValidatorId.Uint64())
	if err != nil {
		return err
	}

	msg, err := stakeTypes.NewMsgStakeUpdate(
		helper.GetFromAddress(sp.cliCtx),
		restaked.ValidatorId.Uint64(),
		math.NewIntFromBigInt(restaked.Total),
		nonce,
	)
	if err != nil {
		return err
	}

	return sp.broadcastStakeMsg(msg, restaked, vLog)
}

func (sp *StakingProcessor) sendShareMintedToGiltConsensus(eventName string, logBytes string) error {
	sp.Logger.Debug("StakingProcessor: ShareMinted ignored; StakeUpdate is the canonical total-stake event", "event", eventName)
	return nil
}

func (sp *StakingProcessor) sendShareBurnedToGiltConsensus(eventName string, logBytes string) error {
	sp.Logger.Debug("StakingProcessor: ShareBurned ignored; StakeUpdate is the canonical total-stake event", "event", eventName)
	return nil
}

func (sp *StakingProcessor) unpackStakingEvent(eventName string, logBytes string, out interface{}) (ethTypes.Log, interface{}, error) {
	if !helper.IsRootAnchoredStakeReadEnabled() {
		sp.Logger.Warn("StakingProcessor: root-anchored stake read disabled; skipping event", "event", eventName)
		return ethTypes.Log{}, nil, nil
	}

	vLog := ethTypes.Log{}
	if err := json.Unmarshal([]byte(logBytes), &vLog); err != nil {
		sp.Logger.Error(errMsgStakingUnmarshallingEvent, "error", err)
		return ethTypes.Log{}, nil, err
	}

	if err := helper.UnpackLog(sp.stakingInfoAbi, out, eventName, &vLog); err != nil {
		sp.Logger.Error(errMsgStakingParsingEvent, "name", eventName, "error", err)
		return ethTypes.Log{}, nil, err
	}

	return vLog, out, nil
}

func (sp *StakingProcessor) broadcastStakeMsg(msg types.Msg, event interface{}, vLog ethTypes.Log) error {
	if !helper.IsRootAnchoredStakeReadEnabled() {
		sp.Logger.Warn("StakingProcessor: root-anchored stake read disabled before broadcast")
		return nil
	}

	if err := msg.ValidateBasic(); err != nil {
		return err
	}

	sp.Logger.Info("StakingProcessor: broadcasting root-derived stake msg",
		"msgType", fmt.Sprintf("%T", msg),
		"txHash", vLog.TxHash.String(),
		"logIndex", vLog.Index,
		"blockNumber", vLog.BlockNumber,
	)

	txRes, err := sp.txBroadcaster.BroadcastToGiltConsensus(context.Background(), msg, event)
	if err != nil {
		sp.Logger.Error(errMsgStakingBroadcasting, "error", err)
		return err
	}
	if txRes.Code != abci.CodeTypeOK {
		sp.Logger.Error(errMsgStakingTxFailed, "txHash", txRes.TxHash, "code", txRes.Code)
		return fmt.Errorf("%s, tx response code: %v", errMsgStakingTxFailed, txRes.Code)
	}

	return nil
}

func (sp *StakingProcessor) nextRootStakeNonce(validatorID uint64) (uint64, error) {
	nonce, err := util.GetValidatorNonce(validatorID, sp.cliCtx.Codec)
	if err != nil {
		return 0, err
	}
	return nonce + 1, nil
}

func normalizeRootPubKey(pubKey []byte) []byte {
	return helper.AppendPrefix(pubKey)
}
