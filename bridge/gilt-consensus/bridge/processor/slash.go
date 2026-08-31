package processor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	abci "github.com/cometbft/cometbft/abci/types"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	ethTypes "github.com/ethereum/go-ethereum/core/types"
	"math/big"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/giltchain/gilt-consensus/bridge/util"
	"github.com/giltchain/gilt-consensus/contracts/stakehub"
	"github.com/giltchain/gilt-consensus/helper"
	hmTypes "github.com/giltchain/gilt-consensus/types"
	checkpointtypes "github.com/giltchain/gilt-consensus/x/checkpoint/types"
	staketypes "github.com/giltchain/gilt-consensus/x/stake/types"
)

// SlashProcessor submits checkpoint-authenticated slash relays to root StakeManager.
type SlashProcessor struct {
	BaseProcessor
}

// NewSlashProcessor creates a slash relay processor.
func NewSlashProcessor() *SlashProcessor {
	return &SlashProcessor{}
}

// Start starts the slash processor.
func (sp *SlashProcessor) Start() error {
	sp.Logger.Info("SlashProcessor: starting")
	go sp.pollRootSlashIntents()
	return nil
}

func (sp *SlashProcessor) pollRootSlashIntents() {
	ticker := time.NewTicker(helper.GetConfig().SyncerPollInterval)
	defer ticker.Stop()

	event := stakehub.ParsedABI.Events["RootSlashIntent"]
	for {
		<-ticker.C

		head, err := sp.contractCaller.GiltChainClient.HeaderByNumber(context.Background(), nil)
		if err != nil || head == nil {
			continue
		}

		chainParams, err := util.GetChainmanagerParams(sp.cliCtx.Codec)
		if err != nil {
			continue
		}

		confirmations := chainParams.GiltChainTxConfirmations
		if head.Number.Uint64() < confirmations {
			continue
		}

		finalizedBlock := head.Number.Uint64() - confirmations
		logs, err := sp.contractCaller.GiltChainClient.FilterLogs(context.Background(), ethereum.FilterQuery{
			FromBlock: new(big.Int).SetUint64(finalizedBlock),
			ToBlock:   new(big.Int).SetUint64(finalizedBlock),
			Addresses: []common.Address{stakehub.StakeHubContract},
			Topics:    [][]common.Hash{{event.ID}},
		})
		if err != nil {
			sp.Logger.Error("SlashProcessor: failed to filter RootSlashIntent logs", "error", err)
			continue
		}

		for _, vLog := range logs {
			parsed, err := stakehub.ParsedABI.Unpack(event.Name, vLog.Data)
			if err != nil {
				continue
			}
			if len(parsed) < 3 {
				continue
			}

			slashType := uint8(parsed[0].(uint8))
			evidenceRef := parsed[1].(common.Hash)
			finalizedHeight := parsed[2].(*big.Int).Uint64()

			rootValidatorID := vLog.Topics[1].Big().Uint64()
			giltChainID := chainParams.ChainParams.GiltChainId

			isProposer, err := util.IsCurrentProposer(sp.cliCtx.Codec)
			if err != nil || !isProposer {
				continue
			}

			result, err := helper.FetchFromAPI(helper.GetGiltConsensusServerEndpoint(util.CurrentProposerURL))
			if err != nil {
				continue
			}

			var proposerResp staketypes.QueryCurrentProposerResponse
			if err := sp.cliCtx.Codec.UnmarshalJSON(result, &proposerResp); err != nil {
				continue
			}

			msg := checkpointtypes.NewMsgSlashRelay(
				proposerResp.Validator.Signer,
				rootValidatorID,
				slashType,
				evidenceRef,
				finalizedHeight,
				giltChainID,
			)

			txRes, err := sp.txBroadcaster.BroadcastToGiltConsensus(context.Background(), msg, vLog)
			if err != nil {
				sp.Logger.Error("SlashProcessor: failed to broadcast slash relay", "error", err)
				continue
			}
			if txRes.Code != abci.CodeTypeOK {
				sp.Logger.Error("SlashProcessor: slash relay tx failed", "code", txRes.Code)
			}
		}
	}
}

// RegisterTasks registers slash relay machinery tasks.
func (sp *SlashProcessor) RegisterTasks() {
	sp.Logger.Info("SlashProcessor: registering slash relay tasks")
	tasks := map[string]interface{}{
		"sendSlashRelayToRoot": sp.sendSlashRelayToRoot,
	}
	for name, handler := range tasks {
		if err := sp.queueConnector.Server.RegisterTask(name, handler); err != nil {
			sp.Logger.Error("SlashProcessor: error registering task", "task", name, "error", err)
		}
	}
}

// sendSlashRelayToRoot packages checkpoint-set signatures and submits relaySlash on StakeManager.
func (sp *SlashProcessor) sendSlashRelayToRoot(eventBytes string, _ int64) error {
	var event sdk.StringEvent
	if err := json.Unmarshal([]byte(eventBytes), &event); err != nil {
		return err
	}

	var (
		validatorID      uint64
		slashType        uint8
		evidenceRef      string
		giltChainID      uint64
		signaturesTxHash string
	)

	for _, attr := range event.Attributes {
		switch attr.Key {
		case checkpointtypes.AttributeKeyValidatorID:
			validatorID, _ = strconv.ParseUint(attr.Value, 10, 64)
		case checkpointtypes.AttributeKeySlashType:
			parsed, _ := strconv.ParseUint(attr.Value, 10, 8)
			slashType = uint8(parsed)
		case checkpointtypes.AttributeKeyEvidenceRef:
			evidenceRef = attr.Value
		case checkpointtypes.AttributeKeyGiltChainId:
			giltChainID, _ = strconv.ParseUint(attr.Value, 10, 64)
		case hmTypes.AttributeKeyTxHash:
			signaturesTxHash = attr.Value
		}
	}

	if validatorID == 0 || evidenceRef == "" || signaturesTxHash == "" || giltChainID == 0 {
		return errors.New("slash relay event missing required fields")
	}

	evidenceHash := common.HexToHash(evidenceRef)
	data, err := helper.PackSlashRelayData(validatorID, slashType, evidenceHash, giltChainID)
	if err != nil {
		return err
	}

	signatures, err := sp.fetchSlashSignatures(signaturesTxHash)
	if err != nil {
		return err
	}

	sigs, err := sp.parseSlashSignatures(signatures)
	if err != nil {
		return err
	}

	chainmanagerParams, err := util.GetChainmanagerParams(sp.cliCtx.Codec)
	if err != nil {
		return err
	}

	stakeManagerAddress := common.HexToAddress(chainmanagerParams.ChainParams.StakeManagerAddress)
	return sp.contractCaller.SendSlashRelay(data, sigs, stakeManagerAddress)
}

func (sp *SlashProcessor) fetchSlashSignatures(txHash string) ([]checkpointtypes.CheckpointSignature, error) {
	url := helper.GetGiltConsensusServerEndpoint(fmt.Sprintf(util.CheckpointSignaturesURL, txHash))
	response, err := helper.FetchFromAPI(url)
	if err != nil {
		return nil, err
	}

	var sigResp checkpointtypes.QueryCheckpointSignaturesResponse
	if err := sp.cliCtx.Codec.UnmarshalJSON(response, &sigResp); err != nil {
		return nil, err
	}
	return sigResp.Signatures, nil
}

func (sp *SlashProcessor) parseSlashSignatures(signatures []checkpointtypes.CheckpointSignature) ([][3]*big.Int, error) {
	dummyLegacyTxn := ethTypes.NewTx(&ethTypes.LegacyTx{
		Nonce:    0,
		To:       &common.Address{},
		Value:    nil,
		Gas:      0,
		GasPrice: nil,
		Data:     nil,
	})

	sigs := make([][3]*big.Int, 0, len(signatures))
	for _, entry := range signatures {
		r, s, v, err := ethTypes.HomesteadSigner{}.SignatureValues(dummyLegacyTxn, entry.Signature)
		if err != nil {
			return nil, err
		}
		sigs = append(sigs, [3]*big.Int{r, s, v})
	}
	if len(sigs) == 0 {
		return nil, errors.New("slash processor: no signatures found")
	}
	return sigs, nil
}
