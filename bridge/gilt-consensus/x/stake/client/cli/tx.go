package cli

import (
	"fmt"
	"strconv"

	sdkmath "cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	"github.com/ethereum/go-ethereum/common"
	"github.com/spf13/cobra"

	commoncli "github.com/giltchain/gilt-consensus/common/cli"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/giltchain/gilt-consensus/x/stake/types"
)

var logger = helper.Logger.With("module", "x/stake/cli")

// NewTxCmd returns a root CLI command handler for all x/stake transaction commands.
func NewTxCmd() *cobra.Command {
	txCmd := &cobra.Command{
		Use:                        types.ModuleName,
		Short:                      "Stake transaction subcommands",
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       client.ValidateCmd,
	}

	txCmd.AddCommand(
		NewApproveValidatorCmd(),
		NewWithdrawValidatorStakeCmd(),
		NewDelegateGoldCmd(),
		NewUndelegateGoldCmd(),
	)

	return txCmd
}

// NewApproveValidatorCmd approves a native validator candidate.
func NewApproveValidatorCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "approve-validator [val-id] [operator] [activation-epoch] [max-gilt-stake] [signer-pubkey] [nonce]",
		Short: "Cast a validator vote on a native validator approval proposal",
		Args:  cobra.ExactArgs(6),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}
			from := clientCtx.GetFromAddress().String()
			if from == "" {
				return fmt.Errorf("from address is required")
			}

			valID, err := parsePositiveUint(args[0], "validator id")
			if err != nil {
				return err
			}
			activationEpoch, err := strconv.ParseUint(args[2], 10, 64)
			if err != nil {
				return fmt.Errorf("invalid activation epoch %q", args[2])
			}
			maxGiltStake, err := parsePositiveAmount(args[3], "max GILT stake")
			if err != nil {
				return err
			}
			pubKey, err := parseSecp256k1PubKey(args[4])
			if err != nil {
				return err
			}
			nonce, err := parsePositiveUint(args[5], "nonce")
			if err != nil {
				return err
			}

			msg, err := types.NewMsgApproveValidator(from, valID, args[1], activationEpoch, maxGiltStake, pubKey, nonce)
			if err != nil {
				return err
			}
			return commoncli.BroadcastMsg(clientCtx, from, msg, logger)
		},
	}
	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// NewWithdrawValidatorStakeCmd withdraws self-staked GILT after unbonding.
func NewWithdrawValidatorStakeCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "withdraw-validator-stake [val-id]",
		Short: "Withdraw validator self-staked GILT after exit unbonding",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}
			from := clientCtx.GetFromAddress().String()
			if from == "" {
				return fmt.Errorf("from address is required")
			}

			valID, err := parsePositiveUint(args[0], "validator id")
			if err != nil {
				return err
			}

			msg := types.NewMsgWithdrawValidatorStake(from, valID)
			return commoncli.BroadcastMsg(clientCtx, from, msg, logger)
		},
	}
	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// NewDelegateGoldCmd returns a CLI command handler for delegating GOLD to validator reward weight.
func NewDelegateGoldCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delegate-gold [val-id] [amount]",
		Short: "Delegate GOLD to a validator for reward-weight accounting",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			from := clientCtx.GetFromAddress().String()
			if from == "" {
				return fmt.Errorf("from address is required")
			}

			valID, err := parsePositiveUint(args[0], "validator id")
			if err != nil {
				return err
			}
			amount, err := parsePositiveAmount(args[1], "GOLD amount")
			if err != nil {
				return err
			}

			msg := types.NewMsgDelegateGold(from, valID, amount)
			return commoncli.BroadcastMsg(clientCtx, from, msg, logger)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// NewUndelegateGoldCmd returns a CLI command handler for undelegating GOLD from validator reward weight.
func NewUndelegateGoldCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "undelegate-gold [val-id] [amount]",
		Short: "Undelegate GOLD from a validator reward-weight position",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			from := clientCtx.GetFromAddress().String()
			if from == "" {
				return fmt.Errorf("from address is required")
			}

			valID, err := parsePositiveUint(args[0], "validator id")
			if err != nil {
				return err
			}
			amount, err := parsePositiveAmount(args[1], "GOLD amount")
			if err != nil {
				return err
			}

			msg := types.NewMsgUndelegateGold(from, valID, amount)
			return commoncli.BroadcastMsg(clientCtx, from, msg, logger)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

func parsePositiveUint(raw string, label string) (uint64, error) {
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value == 0 {
		return 0, fmt.Errorf("invalid %s %q", label, raw)
	}
	return value, nil
}

func parsePositiveAmount(raw string, label string) (sdkmath.Int, error) {
	amount, ok := sdkmath.NewIntFromString(raw)
	if !ok || !amount.IsPositive() {
		return sdkmath.Int{}, fmt.Errorf("invalid %s %q", label, raw)
	}
	return amount, nil
}

func parseSecp256k1PubKey(raw string) (*secp256k1.PubKey, error) {
	pubKeyBytes := common.FromHex(raw)
	if len(pubKeyBytes) != secp256k1.PubKeySize {
		return nil, fmt.Errorf("invalid signer public key length")
	}
	if !helper.IsPubKeyFirstByteValid(pubKeyBytes[0:1]) {
		return nil, fmt.Errorf("invalid signer public key first byte")
	}
	return &secp256k1.PubKey{Key: pubKeyBytes}, nil
}
