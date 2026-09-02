package checkpointroot_test

import (
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/consensus/parlia/checkpointroot"
	"github.com/stretchr/testify/require"
)

func fixtureCheckpointHeaders() []checkpointroot.HeaderFields {
	return []checkpointroot.HeaderFields{
		{
			Number:      0,
			Time:        100,
			TxHash:      common.BytesToHash([]byte{0x01, 0x11}),
			ReceiptHash: common.BytesToHash([]byte{0x01, 0x22}),
		},
		{
			Number:      1,
			Time:        101,
			TxHash:      common.BytesToHash([]byte{0x02, 0x11}),
			ReceiptHash: common.BytesToHash([]byte{0x02, 0x22}),
		},
		{
			Number:      2,
			Time:        102,
			TxHash:      common.BytesToHash([]byte{0x03, 0x11}),
			ReceiptHash: common.BytesToHash([]byte{0x03, 0x22}),
		},
		{
			Number:      3,
			Time:        103,
			TxHash:      common.BytesToHash([]byte{0x04, 0x11}),
			ReceiptHash: common.BytesToHash([]byte{0x04, 0x22}),
		},
	}
}

func TestCheckpointMerkleRootDeterministic(t *testing.T) {
	t.Parallel()

	headers := fixtureCheckpointHeaders()

	root1 := checkpointroot.RootHashFromHeaderFields(headers)
	root2 := checkpointroot.RootHashFromHeaderFields(headers)
	require.Equal(t, root1, root2)
	require.NotEqual(t, [32]byte{}, root1)

	mutated := append([]checkpointroot.HeaderFields(nil), headers...)
	mutated[2].Time = 999
	root3 := checkpointroot.RootHashFromHeaderFields(mutated)
	require.NotEqual(t, root1, root3)
}
