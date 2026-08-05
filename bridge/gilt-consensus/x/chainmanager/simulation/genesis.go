package simulation

import (
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"math/rand"
	"strconv"

	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/ethereum/go-ethereum/common"

	"github.com/giltchain/gilt-consensus/x/chainmanager/types"
)

const (
	MainChainTxConfirmations = "main_chain_tx_confirmations"
	GiltChainTxConfirmations = "gilt_chain_tx_confirmations"
	GiltChainID              = "gilt_chain_id"
	SlashManagerAddress      = "slash_manager_address"
	RootChainAddress         = "root_chain_address"
	StakingInfoAddress       = "staking_info_address"
	StateSenderAddress       = "state_sender_address"
	StateReceiverAddress     = "state_receiver_address"
)

// genMainChainTxConfirmations returns randomized mainChain tx confirmations
func genMainChainTxConfirmations(r *rand.Rand) uint64 {
	return uint64(r.Intn(100) + 1)
}

// genGiltChainTxConfirmations returns randomized mainChain tx confirmations
func genGiltChainTxConfirmations(r *rand.Rand) uint64 {
	return uint64(r.Intn(100) + 1)
}

// genGiltChainId returns a randomized gilt chain id
func genGiltChainId(r *rand.Rand) string {
	return strconv.Itoa(r.Intn(math.MaxInt32))
}

// genGiltConsensusChainId returns a randomized giltconsensus chain id
func genGiltConsensusChainId(giltChainId string) string {
	return "giltconsensus-" + giltChainId
}

func genAddress(r *rand.Rand) string {
	return common.BigToAddress(big.NewInt(int64(r.Intn(math.MaxInt64)))).String()
}

// RandomizedGenState generates a random GenesisState for chainmanager
func RandomizedGenState(simState *module.SimulationState) {
	var (
		mainChainTxConfirmations uint64
		giltChainTxConfirmations uint64
		giltChainID              string
		giltconsensusChainID     string
		slashManagerAddress      string
		rootChainAddress         string
		stakingInfoAddress       string
		stateSenderAddress       string
		stateReceiverAddress     string
	)

	simState.AppParams.GetOrGenerate(MainChainTxConfirmations, &mainChainTxConfirmations, simState.Rand, func(r *rand.Rand) {
		mainChainTxConfirmations = genMainChainTxConfirmations(r)
	})

	simState.AppParams.GetOrGenerate(GiltChainTxConfirmations, &giltChainTxConfirmations, simState.Rand, func(r *rand.Rand) {
		giltChainTxConfirmations = genGiltChainTxConfirmations(r)
	})

	simState.AppParams.GetOrGenerate(GiltChainID, &giltChainID, simState.Rand, func(r *rand.Rand) {
		giltChainID = genGiltChainId(r)
	})

	simState.AppParams.GetOrGenerate(giltconsensusChainID, &giltconsensusChainID, simState.Rand, func(_ *rand.Rand) {
		giltconsensusChainID = genGiltConsensusChainId(giltChainID)
	})

	simState.AppParams.GetOrGenerate(SlashManagerAddress, &slashManagerAddress, simState.Rand, func(r *rand.Rand) {
		slashManagerAddress = genAddress(r)
	})

	simState.AppParams.GetOrGenerate(RootChainAddress, &rootChainAddress, simState.Rand, func(r *rand.Rand) {
		rootChainAddress = genAddress(r)
	})

	simState.AppParams.GetOrGenerate(StakingInfoAddress, &stakingInfoAddress, simState.Rand, func(r *rand.Rand) {
		stakingInfoAddress = genAddress(r)
	})

	simState.AppParams.GetOrGenerate(StateSenderAddress, &stateSenderAddress, simState.Rand, func(r *rand.Rand) {
		stateSenderAddress = genAddress(r)
	})

	simState.AppParams.GetOrGenerate(StateReceiverAddress, &stateReceiverAddress, simState.Rand, func(r *rand.Rand) {
		stateReceiverAddress = genAddress(r)
	})

	chainParams := types.ChainParams{
		GiltChainId:          giltChainID,
		GiltConsensusChainId: giltconsensusChainID,
		SlashManagerAddress:  slashManagerAddress,
		RootChainAddress:     rootChainAddress,
		StakingInfoAddress:   stakingInfoAddress,
		StateSenderAddress:   stateSenderAddress,
		StateReceiverAddress: stateReceiverAddress,
	}

	params := types.NewParams(mainChainTxConfirmations, giltChainTxConfirmations, chainParams)
	chainManagerGenesis := types.NewGenesisState(params)

	bz, err := json.MarshalIndent(&chainManagerGenesis.Params, "", " ")
	if err != nil {
		panic(err)
	}
	fmt.Printf("Selected randomly generated chainmanager parameters:\n%s\n", bz)
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(chainManagerGenesis)
}
