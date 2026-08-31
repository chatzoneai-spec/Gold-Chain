package types

import (
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/stretchr/testify/require"
)

func TestSlashRelayVoteHashAndPack(t *testing.T) {
	evidence := common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	data, err := PackSlashRelayData(7, 0, evidence, 714)
	require.NoError(t, err)
	require.NotEmpty(t, data)

	hash := helper.SlashRelayVoteHash(data)
	require.NotEqual(t, common.Hash{}, hash)

	data2, err := PackSlashRelayData(7, 0, evidence, 714)
	require.NoError(t, err)
	require.Equal(t, data, data2)
	require.Equal(t, hash, helper.SlashRelayVoteHash(data2))
}
