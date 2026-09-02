package checkpointroot

import (
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// HeaderFields is the minimal header data required for checkpoint leaf hashing.
type HeaderFields struct {
	Number      uint64
	Time        uint64
	TxHash      common.Hash
	ReceiptHash common.Hash
}

// HeaderLeafHash returns the Bor-compatible checkpoint leaf hash for one header.
func HeaderLeafHash(fields HeaderFields) [32]byte {
	hash := crypto.Keccak256(appendPaddedBytes32(
		new(big.Int).SetUint64(fields.Number).Bytes(),
		new(big.Int).SetUint64(fields.Time).Bytes(),
		fields.TxHash.Bytes(),
		fields.ReceiptHash.Bytes(),
	))
	var out [32]byte
	copy(out[:], hash)
	return out
}

// HeaderLeafHashFromHeader returns the checkpoint leaf hash for an Ethereum header.
func HeaderLeafHashFromHeader(header *types.Header) [32]byte {
	return HeaderLeafHash(HeaderFields{
		Number:      header.Number.Uint64(),
		Time:        header.Time,
		TxHash:      header.TxHash,
		ReceiptHash: header.ReceiptHash,
	})
}

// RootHashFromHeaderFields returns the checkpoint Merkle root for an ordered header range.
// The tree is padded to the next power of two with zero leaves, matching RootChain exit proofs.
func RootHashFromHeaderFields(headers []HeaderFields) [32]byte {
	leaves := make([][32]byte, nextPowerOfTwo(uint64(len(headers))))
	for i, header := range headers {
		leaves[i] = HeaderLeafHash(header)
	}
	return merkleRoot(leaves)
}

// RootHashFromHeaders returns the checkpoint Merkle root for an ordered Ethereum header range.
func RootHashFromHeaders(headers []*types.Header) [32]byte {
	fields := make([]HeaderFields, len(headers))
	for i, header := range headers {
		fields[i] = HeaderFields{
			Number:      header.Number.Uint64(),
			Time:        header.Time,
			TxHash:      header.TxHash,
			ReceiptHash: header.ReceiptHash,
		}
	}
	return RootHashFromHeaderFields(fields)
}

// MerkleRootFromLeaves returns the checkpoint Merkle root for precomputed leaf hashes.
// The slice must already be padded to the next power of two with zero leaves.
func MerkleRootFromLeaves(leaves [][32]byte) [32]byte {
	return merkleRoot(leaves)
}

func merkleRoot(leaves [][32]byte) [32]byte {
	level := make([][32]byte, len(leaves))
	copy(level, leaves)

	for len(level) > 1 {
		next := make([][32]byte, len(level)/2)
		for i := 0; i < len(level); i += 2 {
			hash := crypto.Keccak256(level[i][:], level[i+1][:])
			copy(next[i/2][:], hash)
		}
		level = next
	}

	return level[0]
}

func appendPaddedBytes32(parts ...[]byte) []byte {
	out := make([]byte, 0, 32*len(parts))
	for _, part := range parts {
		out = append(out, leftPadTo32(part)...)
	}
	return out
}

func leftPadTo32(value []byte) []byte {
	padded := make([]byte, 32)
	if len(value) == 0 || len(value) > 32 {
		return padded
	}
	copy(padded[32-len(value):], value)
	return padded
}

// NextPowerOfTwo rounds n up to the next power of two (minimum 1).
func NextPowerOfTwo(n uint64) uint64 {
	return nextPowerOfTwo(n)
}

func nextPowerOfTwo(n uint64) uint64 {
	if n == 0 {
		return 1
	}
	n--
	n |= n >> 1
	n |= n >> 2
	n |= n >> 4
	n |= n >> 8
	n |= n >> 16
	n |= n >> 32
	n++
	return n
}
