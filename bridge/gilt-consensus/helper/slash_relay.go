package helper

import (
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/giltchain/gilt-consensus/contracts/stakemanager"
)

const slashVotePrefix byte = 0x02

// SlashRelayVoteHash returns keccak256(0x02 || data) used by StakeManager signature verification.
func SlashRelayVoteHash(data []byte) common.Hash {
	return crypto.Keccak256Hash([]byte{slashVotePrefix}, data)
}

// SendSlashRelay submits an authenticated slash to root StakeManager.
func (c *ContractCaller) SendSlashRelay(
	data []byte,
	sigs [][3]*big.Int,
	stakeManagerAddress common.Address,
) error {
	packed, err := stakemanager.ParsedABI.Pack("relaySlash", data, sigs)
	if err != nil {
		Logger.Error("Unable to pack tx for relaySlash", "error", err)
		return err
	}

	auth, err := GenerateAuthObj(GetMainClient(), stakeManagerAddress, packed)
	if err != nil {
		Logger.Error(errUnableToCreateAuthObj, "error", err)
		return err
	}

	sigLog := make([]string, 0, len(sigs))
	for i := 0; i < len(sigs); i++ {
		sigLog = append(sigLog, fmt.Sprintf("[%s,%s,%s]", sigs[i][0].String(), sigs[i][1].String(), sigs[i][2].String()))
	}

	Logger.Debug("Sending slash relay to StakeManager",
		"sigs", strings.Join(sigLog, ","),
		"data", common.Bytes2Hex(data),
		"voteHash", SlashRelayVoteHash(data).Hex(),
	)

	bound, err := stakemanager.Bind(stakeManagerAddress, GetMainClient())
	if err != nil {
		return err
	}

	tx, err := bound.Transact(auth, "relaySlash", data, sigs)
	if err != nil {
		Logger.Error("Error while submitting slash relay", "error", err)
		return err
	}

	Logger.Info("Submitted slash relay to StakeManager successfully", "txHash", tx.Hash().String())
	return nil
}
