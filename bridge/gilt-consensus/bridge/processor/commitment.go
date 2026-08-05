package processor

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"sync/atomic"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	ethTypes "github.com/ethereum/go-ethereum/core/types"

	"github.com/giltchain/gilt-consensus/bridge/util"
	"github.com/giltchain/gilt-consensus/bridge/validatorset"
	"github.com/giltchain/gilt-consensus/contracts/giltvalidatorset"
	"github.com/giltchain/gilt-consensus/contracts/stakehub"
	"github.com/giltchain/gilt-consensus/contracts/validatorsetcommitment"
	"github.com/giltchain/gilt-consensus/helper"
)

const (
	infoMsgCmStarting         = "CommitmentProcessor: starting"
	infoMsgCmRegisteringTasks = "CommitmentProcessor: registering commitment tasks"
	infoMsgCmPollingStopped   = "CommitmentProcessor: polling stopped"
	infoMsgCmBreatheDetected  = "CommitmentProcessor: breathe block detected"
	infoMsgCmDivergenceHalt   = "CommitmentProcessor: validator set divergence detected, halting checkpoint submission"
	infoMsgCmDivergenceClear  = "CommitmentProcessor: validator sets aligned, checkpoint submission allowed"
)

// CommitmentPayload is the sorted handoff payload for ValidatorSetCommitment.submitCommitment.
type CommitmentPayload struct {
	NewEpoch           *big.Int
	ConsensusAddresses []common.Address
	VoteKeys           [][]byte
	VotingPowers       []*big.Int
	Digest             []byte
}

// CommitmentProcessor watches breathe blocks and submits validator set commitments.
type CommitmentProcessor struct {
	BaseProcessor

	cancelPoll context.CancelFunc

	lastProcessedBreatheParent atomic.Uint64
}

// NewCommitmentProcessor creates a commitment processor.
func NewCommitmentProcessor() *CommitmentProcessor {
	return &CommitmentProcessor{}
}

// Start polls finalized gilt headers for breathe blocks and runs the divergence watchdog.
func (cp *CommitmentProcessor) Start() error {
	cp.Logger.Info(infoMsgCmStarting)

	ctx, cancelPoll := context.WithCancel(context.Background())
	cp.cancelPoll = cancelPoll

	pollInterval := helper.GetConfig().SpanPollInterval
	if pollInterval == 0 {
		pollInterval = helper.DefaultSpanPollInterval
	}

	go cp.pollLoop(ctx, pollInterval)
	return nil
}

// RegisterTasks registers commitment machinery tasks.
func (cp *CommitmentProcessor) RegisterTasks() {
	cp.Logger.Info(infoMsgCmRegisteringTasks)
	// Root-chain broadcast uses submitCommitmentWithSigs once >=2/3 ascending ECDSA sigs are collected.
}

func (cp *CommitmentProcessor) pollLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cp.handleFinalizedHeader(ctx)
			cp.runDivergenceWatchdog(ctx)
		case <-ctx.Done():
			cp.Logger.Info(infoMsgCmPollingStopped)
			return
		}
	}
}

func (cp *CommitmentProcessor) handleFinalizedHeader(ctx context.Context) {
	header, err := cp.contractCaller.GetGiltChainFinalizedBlock(ctx)
	if err != nil || header == nil {
		cp.Logger.Error("CommitmentProcessor: error fetching finalized header", "error", err)
		return
	}

	parentNum := header.Number.Uint64() - 1
	if parentNum == 0 {
		return
	}

	parent, err := cp.contractCaller.GetGiltChainBlock(ctx, big.NewInt(0).SetUint64(parentNum))
	if err != nil || parent == nil {
		cp.Logger.Error("CommitmentProcessor: error fetching parent header", "error", err)
		return
	}

	if !validatorset.IsBreatheBlock(parent.Time, header.Time) {
		return
	}

	if cp.lastProcessedBreatheParent.Load() == parentNum {
		return
	}

	cp.Logger.Info(infoMsgCmBreatheDetected,
		"breatheBlock", header.Number.Uint64(),
		"parentBlock", parentNum,
	)

	payload, err := cp.buildCommitmentPayload(ctx, parentNum)
	if err != nil {
		cp.Logger.Error("CommitmentProcessor: error building commitment payload", "error", err)
		return
	}

	cp.lastProcessedBreatheParent.Store(parentNum)

	cp.Logger.Info("CommitmentProcessor: commitment payload ready for signing",
		"epoch", payload.NewEpoch,
		"validatorCount", len(payload.ConsensusAddresses),
		"digest", common.Bytes2Hex(payload.Digest),
		"parentBlock", parentNum,
	)
}

func (cp *CommitmentProcessor) buildCommitmentPayload(ctx context.Context, parentBlockNum uint64) (*CommitmentPayload, error) {
	parentBlock := big.NewInt(0).SetUint64(parentBlockNum)

	items, err := cp.getValidatorElectionInfo(ctx, parentBlock)
	if err != nil {
		return nil, err
	}

	maxElected, err := cp.getMaxElectedValidators(ctx, parentBlock)
	if err != nil {
		return nil, err
	}

	elected := validatorset.GetTopValidatorsByVotingPower(items, maxElected)
	if len(elected) == 0 {
		return nil, errors.New("CommitmentProcessor: empty elected validator set")
	}

	commitmentAddr, err := cp.getCommitmentContractAddress()
	if err != nil {
		return nil, err
	}

	instance, err := validatorsetcommitment.NewValidatorSetCommitment(commitmentAddr, cp.contractCaller.MainChainClient)
	if err != nil {
		return nil, err
	}

	currentEpoch, err := instance.CommitmentEpoch(&bind.CallOpts{Context: ctx})
	if err != nil {
		return nil, err
	}

	addrs, voteKeys, powers := sortCommitmentFields(elected)
	newEpoch := new(big.Int).Add(currentEpoch, big.NewInt(1))

	return &CommitmentPayload{
		NewEpoch:           newEpoch,
		ConsensusAddresses: addrs,
		VoteKeys:           voteKeys,
		VotingPowers:       powers,
		Digest:             helper.CommitmentDigest(newEpoch, addrs, voteKeys, powers),
	}, nil
}

func (cp *CommitmentProcessor) getValidatorElectionInfo(ctx context.Context, blockNum *big.Int) ([]validatorset.ValidatorItem, error) {
	contract, err := stakehub.Bind(stakehub.StakeHubContract, cp.contractCaller.GiltChainClient)
	if err != nil {
		return nil, err
	}

	callOpts := &bind.CallOpts{Context: ctx, BlockNumber: blockNum}
	var out []interface{}
	if err := contract.Call(callOpts, &out, "getValidatorElectionInfo", big.NewInt(0), big.NewInt(0)); err != nil {
		return nil, err
	}

	validators := *abi.ConvertType(out[0], new([]common.Address)).(*[]common.Address)
	votingPowers := *abi.ConvertType(out[1], new([]*big.Int)).(*[]*big.Int)
	voteAddrs := *abi.ConvertType(out[2], new([][]byte)).(*[][]byte)
	totalLength := out[3].(*big.Int)

	if totalLength.Int64() != int64(len(validators)) || totalLength.Int64() != int64(len(votingPowers)) || totalLength.Int64() != int64(len(voteAddrs)) {
		return nil, errors.New("CommitmentProcessor: validator length mismatch")
	}

	items := make([]validatorset.ValidatorItem, len(validators))
	for i := range validators {
		items[i] = validatorset.ValidatorItem{
			Address:     validators[i],
			VotingPower: votingPowers[i],
			VoteAddress: voteAddrs[i],
		}
	}

	return items, nil
}

func (cp *CommitmentProcessor) getMaxElectedValidators(ctx context.Context, blockNum *big.Int) (*big.Int, error) {
	contract, err := stakehub.Bind(stakehub.StakeHubContract, cp.contractCaller.GiltChainClient)
	if err != nil {
		return nil, err
	}

	callOpts := &bind.CallOpts{Context: ctx, BlockNumber: blockNum}
	var out []interface{}
	if err := contract.Call(callOpts, &out, "maxElectedValidators"); err != nil {
		return nil, err
	}

	return out[0].(*big.Int), nil
}

func sortCommitmentFields(elected []validatorset.ElectedValidator) ([]common.Address, [][]byte, []*big.Int) {
	sorted := append([]validatorset.ElectedValidator(nil), elected...)
	sort.Slice(sorted, func(i, j int) bool {
		return bytes.Compare(sorted[i].Address.Bytes(), sorted[j].Address.Bytes()) < 0
	})

	addrs := make([]common.Address, len(sorted))
	voteKeys := make([][]byte, len(sorted))
	powers := make([]*big.Int, len(sorted))
	for i, v := range sorted {
		addrs[i] = v.Address
		voteKeys[i] = v.VoteAddress
		powers[i] = new(big.Int).SetUint64(v.VotingPower)
	}

	return addrs, voteKeys, powers
}

// sendCommitmentToRootChain is the machinery entrypoint: rebuild payload at parentBlockNum,
// attach sorted ascending ECDSA sigs (StakeManager uint256[3][] format), then broadcast.
func (cp *CommitmentProcessor) sendCommitmentToRootChain(parentBlockNum uint64, sigs [][3]*big.Int) error {
	ctx := context.Background()
	payload, err := cp.buildCommitmentPayload(ctx, parentBlockNum)
	if err != nil {
		return err
	}

	return cp.submitCommitmentWithSigs(payload, sigs)
}

// submitCommitmentWithSigs broadcasts submitCommitment once >=2/3 sigs are attached.
func (cp *CommitmentProcessor) submitCommitmentWithSigs(payload *CommitmentPayload, sigs [][3]*big.Int) error {
	if payload == nil {
		return errors.New("CommitmentProcessor: missing commitment payload")
	}

	if len(sigs) == 0 {
		return errors.New("CommitmentProcessor: no commitment signatures attached; collect >=2/3 ECDSA sigs over digest before broadcast")
	}

	if IsCheckpointSubmissionHalted() {
		return errors.New("CommitmentProcessor: checkpoint submission halted due to validator set divergence")
	}

	commitmentAddr, err := cp.getCommitmentContractAddress()
	if err != nil {
		return err
	}

	instance, err := validatorsetcommitment.NewValidatorSetCommitment(commitmentAddr, cp.contractCaller.MainChainClient)
	if err != nil {
		return err
	}

	return helper.SendCommitment(
		payload.NewEpoch,
		payload.ConsensusAddresses,
		payload.VoteKeys,
		payload.VotingPowers,
		sigs,
		commitmentAddr,
		instance,
	)
}

// parseCommitmentSignatures converts checkpoint-style side tx signatures into uint256[3][] ascending ECDSA sigs.
func (cp *CommitmentProcessor) parseCommitmentSignatures(raw interface{}) ([][3]*big.Int, error) {
	type sideTxSig struct {
		address []byte
		sig     []byte
	}

	sideTxSigs, ok := raw.([]sideTxSig)
	if !ok {
		return nil, errors.New("CommitmentProcessor: invalid commitment signature payload")
	}

	if len(sideTxSigs) == 0 {
		return nil, errors.New("CommitmentProcessor: no commitment sigs found")
	}

	sort.Slice(sideTxSigs, func(i, j int) bool {
		return bytes.Compare(sideTxSigs[i].address, sideTxSigs[j].address) < 0
	})

	dummyLegacyTxn := ethTypes.NewTx(&ethTypes.LegacyTx{
		Nonce:    0,
		To:       &common.Address{},
		Value:    nil,
		Gas:      0,
		GasPrice: nil,
		Data:     nil,
	})

	sigs := make([][3]*big.Int, 0, len(sideTxSigs))
	for _, sideTxSig := range sideTxSigs {
		r, s, v, err := ethTypes.HomesteadSigner{}.SignatureValues(dummyLegacyTxn, sideTxSig.sig)
		if err != nil {
			return nil, err
		}
		sigs = append(sigs, [3]*big.Int{r, s, v})
	}

	return sigs, nil
}

func (cp *CommitmentProcessor) getCommitmentContractAddress() (common.Address, error) {
	params, err := util.GetChainmanagerParams(cp.cliCtx.Codec)
	if err != nil {
		return common.Address{}, err
	}

	return cp.contractCaller.GetValidatorSetCommitmentAddress(params.ChainParams.StakingInfoAddress)
}

func (cp *CommitmentProcessor) runDivergenceWatchdog(ctx context.Context) {
	committed, err := cp.getCommittedValidatorPowers(ctx)
	if err != nil {
		cp.Logger.Error("CommitmentProcessor: error reading committed validator set", "error", err)
		return
	}

	live, err := cp.getGiltLivingValidatorPowers(ctx)
	if err != nil {
		cp.Logger.Error("CommitmentProcessor: error reading gilt validator set", "error", err)
		return
	}

	if validatorPowerSetsEqual(committed, live) {
		if IsCheckpointSubmissionHalted() {
			cp.Logger.Info(infoMsgCmDivergenceClear)
		}
		SetCheckpointSubmissionHalted(false)
		return
	}

	cp.Logger.Error(infoMsgCmDivergenceHalt,
		"committedCount", len(committed),
		"liveCount", len(live),
	)
	SetCheckpointSubmissionHalted(true)
}

func (cp *CommitmentProcessor) getCommittedValidatorPowers(ctx context.Context) (map[common.Address]uint64, error) {
	commitmentAddr, err := cp.getCommitmentContractAddress()
	if err != nil {
		return nil, err
	}

	instance, err := validatorsetcommitment.NewValidatorSetCommitment(commitmentAddr, cp.contractCaller.MainChainClient)
	if err != nil {
		return nil, err
	}

	callOpts := &bind.CallOpts{Context: ctx}
	signers, err := instance.GetSigners(callOpts)
	if err != nil {
		return nil, err
	}

	powers := make(map[common.Address]uint64, len(signers))
	for _, signer := range signers {
		power, err := instance.GetSignerPower(callOpts, signer)
		if err != nil {
			return nil, err
		}
		powers[signer] = power.Uint64()
	}

	return powers, nil
}

func (cp *CommitmentProcessor) getGiltLivingValidatorPowers(ctx context.Context) (map[common.Address]uint64, error) {
	contract, err := giltvalidatorset.Bind(giltvalidatorset.ValidatorContract, cp.contractCaller.GiltChainClient)
	if err != nil {
		return nil, err
	}

	callOpts := &bind.CallOpts{Context: ctx}
	var out []interface{}
	if err := contract.Call(callOpts, &out, "getLivingValidators"); err != nil {
		return nil, err
	}

	addresses := *abi.ConvertType(out[0], new([]common.Address)).(*[]common.Address)
	powers := make(map[common.Address]uint64, len(addresses))

	for _, addr := range addresses {
		power, err := cp.getGiltValidatorPower(ctx, contract, addr)
		if err != nil {
			return nil, err
		}
		powers[addr] = power
	}

	return powers, nil
}

func (cp *CommitmentProcessor) getGiltValidatorPower(ctx context.Context, contract *bind.BoundContract, addr common.Address) (uint64, error) {
	callOpts := &bind.CallOpts{Context: ctx}

	var mapOut []interface{}
	if err := contract.Call(callOpts, &mapOut, "currentValidatorSetMap", addr); err != nil {
		return 0, err
	}

	index := mapOut[0].(*big.Int).Uint64()
	if index == 0 {
		return 0, fmt.Errorf("CommitmentProcessor: validator %s not in currentValidatorSetMap", addr.Hex())
	}

	var valOut []interface{}
	if err := contract.Call(callOpts, &valOut, "currentValidatorSet", index-1); err != nil {
		return 0, err
	}

	// currentValidatorSet returns (consensusAddress, feeAddress, BBCFeeAddress, votingPower, jailed, incoming)
	power := abi.ConvertType(valOut[3], new(uint64)).(*uint64)
	return *power, nil
}

func validatorPowerSetsEqual(a, b map[common.Address]uint64) bool {
	if len(a) != len(b) {
		return false
	}
	for addr, power := range a {
		if b[addr] != power {
			return false
		}
	}
	return true
}

// Stop cancels polling.
func (cp *CommitmentProcessor) Stop() {
	if cp.cancelPoll != nil {
		cp.cancelPoll()
	}
}
