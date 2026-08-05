package types

import (
	"fmt"

	"github.com/ethereum/go-ethereum/common"

	"github.com/giltchain/gilt-consensus/helper"
)

// Default parameter values
const (
	DefaultMainChainTxConfirmations uint64 = 6
	DefaultGiltChainTxConfirmations uint64 = 10
	MinMainChainTxConfirmations     uint64 = 6
	MinGiltChainTxConfirmations     uint64 = 10

	DefaultStateReceiverAddress = "0x0000000000000000000000000000000000003001"
	DefaultSlashManagerAddress  = "0x0000000000000000000000000000000000000000"
	DefaultRootChainAddress     = "0x0000000000000000000000000000000000000000"
	DefaultStakingInfoAddress   = "0x0000000000000000000000000000000000000000"
	DefaultStateSenderAddress   = "0x0000000000000000000000000000000000000000"
)

// DefaultParams returns a default set of parameters.
func DefaultParams() Params {
	return Params{
		MainChainTxConfirmations: DefaultMainChainTxConfirmations,
		GiltChainTxConfirmations: DefaultGiltChainTxConfirmations,
		ChainParams: ChainParams{
			GiltChainId:          helper.DefaultGiltChainID,
			GiltConsensusChainId: helper.DefaultGiltConsensusChainID,
			SlashManagerAddress:  DefaultSlashManagerAddress,
			RootChainAddress:     DefaultRootChainAddress,
			StakingInfoAddress:   DefaultStakingInfoAddress,
			StateSenderAddress:   DefaultStateSenderAddress,
			StateReceiverAddress: DefaultStateReceiverAddress,
		},
	}
}

// NewParams creates a new Params object
func NewParams(mainChainTxConfirmations uint64, giltChainTxConfirmations uint64, chainParams ChainParams) Params {
	return Params{
		MainChainTxConfirmations: mainChainTxConfirmations,
		GiltChainTxConfirmations: giltChainTxConfirmations,
		ChainParams:              chainParams,
	}
}

// ValidateBasic checks that the parameters have valid values.
func (p Params) ValidateBasic() error {
	if p.MainChainTxConfirmations < MinMainChainTxConfirmations {
		return fmt.Errorf(
			"main_chain_tx_confirmations must be >= %d, got %d",
			MinMainChainTxConfirmations,
			p.MainChainTxConfirmations,
		)
	}

	if p.GiltChainTxConfirmations < MinGiltChainTxConfirmations {
		return fmt.Errorf(
			"gilt_chain_tx_confirmations must be >= %d, got %d",
			MinGiltChainTxConfirmations,
			p.GiltChainTxConfirmations,
		)
	}

	if err := validateGiltConsensusAddress("slash_manager_address", p.ChainParams.SlashManagerAddress); err != nil {
		return err
	}

	if err := validateGiltConsensusAddress("root_chain_address", p.ChainParams.RootChainAddress); err != nil {
		return err
	}

	if err := validateGiltConsensusAddress("staking_info_address", p.ChainParams.StakingInfoAddress); err != nil {
		return err
	}

	if err := validateGiltConsensusAddress("state_sender_address", p.ChainParams.StateSenderAddress); err != nil {
		return err
	}

	if err := validateGiltConsensusAddress("state_receiver_address", p.ChainParams.StateReceiverAddress); err != nil {
		return err
	}

	return nil
}

func validateGiltConsensusAddress(key string, value string) error {
	if !common.IsHexAddress(value) {
		return fmt.Errorf("invalid address for value %s for %s in chain_params", value, key)
	}

	return nil
}
