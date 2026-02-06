package qkcapi

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
	"sync"

	"github.com/QuarkChain/goquarkchain/account"
	qCommon "github.com/QuarkChain/goquarkchain/common"
	"github.com/QuarkChain/goquarkchain/common/hexutil"
	"github.com/QuarkChain/goquarkchain/core/types"
	"github.com/ethereum/go-ethereum/common"
	ethTypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/rlp"
	"github.com/ybbus/jsonrpc"
)

// ShardInfo contains the configuration for a single shard
type ShardInfo struct {
	FullShardID uint32
	ChainID     uint32
}

// UnifiedShardAPI provides a single RPC endpoint that routes requests
// to the appropriate shard based on the address involved.
// This enables MetaMask compatibility with standard 20-byte addresses.
type UnifiedShardAPI struct {
	// shardSize is the number of shards (must be power of 2)
	shardSize uint32

	// chainID is the EVM chain ID for signing
	chainID uint32

	// shards maps shardID -> ShardInfo
	shards map[uint32]ShardInfo

	// client is the RPC client to the QuarkChain cluster
	client jsonrpc.RPCClient

	// hashMap stores eth tx hash -> qkc tx hash mapping
	// Protected by mutex for concurrent access
	hashMapMu sync.RWMutex
	hashMap   map[common.Hash]txHashInfo
}

// txHashInfo stores the QuarkChain hash and the shard where tx was sent
type txHashInfo struct {
	qkcHash     common.Hash
	fullShardID uint32
}

// NewUnifiedShardAPI creates a UnifiedShardAPI that routes to multiple shards.
//
// Parameters:
//   - shardSize: number of shards (must be power of 2: 1, 2, 4, 8, etc.)
//   - chainID: EVM chain ID for transaction signing
//   - shards: slice of ShardInfo for each shard
//   - client: RPC client to QuarkChain cluster
func NewUnifiedShardAPI(shardSize uint32, chainID uint32, shards []ShardInfo, client jsonrpc.RPCClient) (*UnifiedShardAPI, error) {
	// Validate shardSize is power of 2
	if shardSize == 0 || (shardSize&(shardSize-1)) != 0 {
		return nil, fmt.Errorf("shardSize must be power of 2, got %d", shardSize)
	}

	// Validate we have the right number of shards
	if uint32(len(shards)) != shardSize {
		return nil, fmt.Errorf("expected %d shards, got %d", shardSize, len(shards))
	}

	// Build shard map
	shardMap := make(map[uint32]ShardInfo)
	for _, s := range shards {
		shardID := s.FullShardID & (shardSize - 1)
		if _, exists := shardMap[shardID]; exists {
			return nil, fmt.Errorf("duplicate shard ID %d", shardID)
		}
		shardMap[shardID] = s
	}

	// Verify all shard IDs from 0 to shardSize-1 are present
	for i := uint32(0); i < shardSize; i++ {
		if _, exists := shardMap[i]; !exists {
			return nil, fmt.Errorf("missing shard ID %d", i)
		}
	}

	return &UnifiedShardAPI{
		shardSize: shardSize,
		chainID:   chainID,
		shards:    shardMap,
		client:    client,
		hashMap:   make(map[common.Hash]txHashInfo),
	}, nil
}

// deriveShardID derives the shard ID from a 20-byte address using Zilliqa-style routing.
// ShardID = last_byte_of_address & (shardSize - 1)
func (u *UnifiedShardAPI) deriveShardID(addr common.Address) uint32 {
	lastByte := uint32(addr[len(addr)-1])
	return lastByte & (u.shardSize - 1)
}

// deriveFullShardKey derives the full shard key from a 20-byte address.
// FullShardKey = (chainID << 16) | shardID
// For simplicity, we use chainID 0 for the shard key (not the EVM chainID)
func (u *UnifiedShardAPI) deriveFullShardKey(addr common.Address) uint32 {
	shardID := u.deriveShardID(addr)
	// ChainID in FullShardKey is the QuarkChain chain ID (typically 0), not EVM chainID
	return shardID
}

// getFullShardIDForAddress returns the full shard ID for routing an address
func (u *UnifiedShardAPI) getFullShardIDForAddress(addr common.Address) uint32 {
	shardID := u.deriveShardID(addr)
	return u.shards[shardID].FullShardID
}

// ChainId returns the EVM chain ID
func (u *UnifiedShardAPI) ChainId() hexutil.Uint64 {
	return hexutil.Uint64(u.chainID)
}

// GasPrice returns the gas price from shard 0 (gas price should be network-wide)
func (u *UnifiedShardAPI) GasPrice() (*hexutil.Big, error) {
	// Use shard 0 for gas price - it should be consistent across shards
	fullShardID := u.shards[0].FullShardID
	resp, err := u.client.Call("gasPrice", hexutil.EncodeUint64(uint64(fullShardID)))
	if err != nil {
		return nil, err
	}
	gasPriceStr, ok := resp.Result.(string)
	if !ok {
		return nil, errors.New("invalid gas price response")
	}
	gasPrice, err := hexutil.DecodeBig(gasPriceStr)
	if err != nil {
		return nil, err
	}
	if gasPrice.Cmp(new(big.Int).SetUint64(0)) == 0 {
		gasPrice = new(big.Int).SetUint64(1)
	}
	return (*hexutil.Big)(gasPrice), nil
}

// GetBalance returns the balance for an address, routing to the correct shard
func (u *UnifiedShardAPI) GetBalance(address common.Address, blockNrOrHash string) (*hexutil.Big, error) {
	fullShardKey := u.deriveFullShardKey(address)
	qkcAddr := account.NewAddress(address, fullShardKey)

	resp, err := u.client.Call("getBalances", qkcAddr.ToHex(), blockNrOrHash)
	if err != nil {
		return nil, err
	}

	result, ok := resp.Result.(map[string]interface{})
	if !ok {
		return nil, errors.New("invalid response format")
	}

	balances, ok := result["balances"].([]interface{})
	if !ok {
		return &hexutil.Big{}, nil
	}

	for _, b := range balances {
		bInfo, ok := b.(map[string]interface{})
		if !ok {
			continue
		}
		tokenStr, ok := bInfo["tokenStr"].(string)
		if !ok {
			continue
		}
		if tokenStr == DefaultTokenID || tokenStr == "QKC" {
			balStr, ok := bInfo["balance"].(string)
			if !ok {
				continue
			}
			bal, err := hexutil.DecodeBig(balStr)
			if err != nil {
				return nil, err
			}
			return (*hexutil.Big)(bal), nil
		}
	}
	return &hexutil.Big{}, nil
}

// BlockNumber returns the latest block number.
// Since shards can have different heights, we return the minimum to be safe.
// For a unified view, clients should not rely on block numbers across shards.
func (u *UnifiedShardAPI) BlockNumber() (hexutil.Uint64, error) {
	// Return block number from shard 0 - this is a simplification
	// In a true unified API, you might want to aggregate or pick a specific shard
	fullShardID := u.shards[0].FullShardID
	resp, err := u.client.Call("getMinorBlockByHeight", hexutil.EncodeUint64(uint64(fullShardID)))
	if err != nil {
		return 0, err
	}
	result, ok := resp.Result.(map[string]interface{})
	if !ok {
		return 0, errors.New("invalid response")
	}
	heightStr, ok := result["height"].(string)
	if !ok {
		return 0, errors.New("missing height")
	}
	height, err := hexutil.DecodeUint64(heightStr)
	return hexutil.Uint64(height), err
}

// GetBlockByNumber returns a block by number from shard 0
func (u *UnifiedShardAPI) GetBlockByNumber(blockNr string, fullTx bool) (map[string]interface{}, error) {
	fullShardID := u.shards[0].FullShardID
	var resp *jsonrpc.RPCResponse
	var err error

	if blockNr == "latest" {
		resp, err = u.client.Call("getMinorBlockByHeight", hexutil.EncodeUint64(uint64(fullShardID)), nil, fullTx)
	} else {
		resp, err = u.client.Call("getMinorBlockByHeight", hexutil.EncodeUint64(uint64(fullShardID)), blockNr, fullTx)
	}
	if err != nil {
		return nil, err
	}

	block, ok := resp.Result.(map[string]interface{})
	if !ok {
		return nil, errors.New("GetBlockByNumber failed")
	}
	return reWriteBlockResult(block), nil
}

// GetTransactionCount returns the nonce for an address, routing to the correct shard
func (u *UnifiedShardAPI) GetTransactionCount(address common.Address, blockNr string) (hexutil.Uint64, error) {
	fullShardKey := u.deriveFullShardKey(address)
	qkcAddr := account.NewAddress(address, fullShardKey)

	var resp *jsonrpc.RPCResponse
	var err error

	if blockNr == "pending" {
		resp, err = u.client.Call("getTransactionCount", qkcAddr.ToHex(), nil)
	} else {
		resp, err = u.client.Call("getTransactionCount", qkcAddr.ToHex(), blockNr)
	}
	if err != nil {
		return 0, err
	}

	nonceStr, ok := resp.Result.(string)
	if !ok {
		return 0, errors.New("invalid nonce response")
	}
	nonce, err := hexutil.DecodeUint64(nonceStr)
	return hexutil.Uint64(nonce), err
}

// GetCode returns the code at an address, routing to the correct shard
func (u *UnifiedShardAPI) GetCode(address common.Address, blockNr string) (hexutil.Bytes, error) {
	fullShardKey := u.deriveFullShardKey(address)
	qkcAddr := account.NewAddress(address, fullShardKey)

	var resp *jsonrpc.RPCResponse
	var err error

	if blockNr == "pending" {
		resp, err = u.client.Call("getCode", qkcAddr.ToHex(), nil)
	} else {
		resp, err = u.client.Call("getCode", qkcAddr.ToHex(), blockNr)
	}
	if err != nil {
		return nil, err
	}

	codeStr, ok := resp.Result.(string)
	if !ok {
		return nil, errors.New("invalid code response")
	}
	return hexutil.Decode(codeStr)
}

// GetBlockByHash returns a block by hash.
// We need to try all shards since we don't know which shard the block is in.
func (u *UnifiedShardAPI) GetBlockByHash(hash common.Hash, fullTx bool) (map[string]interface{}, error) {
	// Try each shard until we find the block
	for shardID := uint32(0); shardID < u.shardSize; shardID++ {
		fullShardID := u.shards[shardID].FullShardID
		// Copy hash bytes to avoid corrupting the original hash's underlying array
		hashBytes := make([]byte, len(hash.Bytes()))
		copy(hashBytes, hash.Bytes())
		blockID := append(hashBytes, qCommon.Uint32ToBytes(fullShardID)...)

		resp, err := u.client.Call("getMinorBlockById", common.ToHex(blockID), fullTx)
		if err != nil {
			continue
		}
		if resp.Result == nil {
			continue
		}

		block, ok := resp.Result.(map[string]interface{})
		if !ok || block == nil {
			continue
		}

		return reWriteBlockResult(block), nil
	}

	return nil, errors.New("block not found")
}

// SendRawTransaction sends a raw transaction, routing based on sender address
func (u *UnifiedShardAPI) SendRawTransaction(encodedTx hexutil.Bytes) (common.Hash, error) {
	// Decode the Ethereum transaction
	tx := new(ethTypes.Transaction)
	if err := rlp.DecodeBytes(encodedTx, tx); err != nil {
		return common.Hash{}, fmt.Errorf("failed to decode transaction: %v", err)
	}

	// Recover sender address from signature
	signer := ethTypes.NewEIP155Signer(big.NewInt(int64(u.chainID)))
	sender, err := ethTypes.Sender(signer, tx)
	if err != nil {
		// Try legacy signer
		signer := ethTypes.HomesteadSigner{}
		sender, err = ethTypes.Sender(signer, tx)
		if err != nil {
			return common.Hash{}, fmt.Errorf("failed to recover sender: %v", err)
		}
	}

	// Derive shard from sender address
	fromFullShardKey := u.deriveFullShardKey(sender)
	fromFullShardID := u.getFullShardIDForAddress(sender)

	// Derive shard for recipient (or same as sender for contract creation)
	var toFullShardKey uint32
	if tx.To() != nil {
		toFullShardKey = u.deriveFullShardKey(*tx.To())
	} else {
		// Contract creation - deploy to sender's shard
		toFullShardKey = fromFullShardKey
	}

	// Create QuarkChain transaction
	var evmTx *types.EvmTransaction
	if tx.To() != nil {
		evmTx = types.NewEvmTransaction(
			tx.Nonce(),
			*tx.To(),
			tx.Value(),
			tx.Gas(),
			tx.GasPrice(),
			fromFullShardKey,
			toFullShardKey,
			u.chainID,
			2, // version
			tx.Data(),
			35760, // default gas token
			35760, // default transfer token
		)
	} else {
		evmTx = types.NewEvmContractCreation(
			tx.Nonce(),
			tx.Value(),
			tx.Gas(),
			tx.GasPrice(),
			fromFullShardKey,
			toFullShardKey,
			u.chainID,
			2, // version
			tx.Data(),
			35760, // default gas token
			35760, // default transfer token
		)
	}

	// Copy signature
	evmTx.SetVRS(tx.RawSignatureValues())

	// Encode and send
	rlpTxBytes, err := rlp.EncodeToBytes(evmTx)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to encode transaction: %v", err)
	}

	_, err = u.client.Call("sendRawTransaction", common.ToHex(rlpTxBytes))
	if err != nil {
		return common.Hash{}, err
	}

	// Build QuarkChain transaction for hash
	txQkc := &types.Transaction{
		TxType: types.EvmTx,
		EvmTx:  evmTx,
	}

	// Store mapping from eth hash to qkc hash + shard
	u.hashMapMu.Lock()
	u.hashMap[tx.Hash()] = txHashInfo{
		qkcHash:     txQkc.Hash(),
		fullShardID: fromFullShardID,
	}
	u.hashMapMu.Unlock()

	return txQkc.Hash(), nil
}

// getTxIDWithShard builds the transaction ID with shard suffix
func getTxIDWithShard(hash common.Hash, fullShardID uint32) []byte {
	fullShardIDBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(fullShardIDBytes, fullShardID)

	txID := make([]byte, 0, 36)
	txID = append(txID, hash.Bytes()...)
	txID = append(txID, fullShardIDBytes...)
	return txID
}

// GetTransactionByHash returns transaction details by hash
func (u *UnifiedShardAPI) GetTransactionByHash(ethHash common.Hash) (map[string]interface{}, error) {
	// Check if we have a mapping for this hash
	u.hashMapMu.RLock()
	info, ok := u.hashMap[ethHash]
	u.hashMapMu.RUnlock()

	if ok {
		// We know the exact shard
		txID := getTxIDWithShard(info.qkcHash, info.fullShardID)
		return u.getTransactionByID(txID)
	}

	// We don't have a mapping - try all shards
	for shardID := uint32(0); shardID < u.shardSize; shardID++ {
		fullShardID := u.shards[shardID].FullShardID
		txID := getTxIDWithShard(ethHash, fullShardID)

		result, err := u.getTransactionByID(txID)
		if err == nil && result != nil {
			return result, nil
		}
	}

	return nil, nil // Transaction not found
}

func (u *UnifiedShardAPI) getTransactionByID(txID []byte) (map[string]interface{}, error) {
	resp, err := u.client.Call("getTransactionById", common.ToHex(txID))
	if err != nil {
		return nil, err
	}
	if resp.Result == nil {
		return nil, nil
	}

	ans, ok := resp.Result.(map[string]interface{})
	if !ok {
		return nil, nil
	}

	// Truncate addresses to 20 bytes (remove shard suffix)
	if ans["from"] != nil {
		fromStr, ok := ans["from"].(string)
		if ok && len(fromStr) > 42 {
			ans["from"] = fromStr[:42]
		}
	}
	if ans["to"] != nil {
		toStr, ok := ans["to"].(string)
		if ok {
			if len(toStr) > 42 {
				ans["to"] = toStr[:42]
			} else if len(toStr) <= 2 {
				delete(ans, "to")
			}
		}
	}
	if ans["data"] != nil {
		ans["input"] = ans["data"]
	}
	if ans["blockId"] != nil {
		blockIdStr, ok := ans["blockId"].(string)
		if ok && len(blockIdStr) > 66 {
			ans["blockHash"] = blockIdStr[:66]
		}
	}
	if ans["blockHeight"] != nil {
		ans["blockNumber"] = ans["blockHeight"]
	}

	return ans, nil
}

// GetTransactionReceipt returns the receipt for a transaction
func (u *UnifiedShardAPI) GetTransactionReceipt(ethHash common.Hash) (map[string]interface{}, error) {
	// Check if we have a mapping for this hash
	u.hashMapMu.RLock()
	info, ok := u.hashMap[ethHash]
	u.hashMapMu.RUnlock()

	if ok {
		// We know the exact shard
		txID := getTxIDWithShard(info.qkcHash, info.fullShardID)
		return u.getTransactionReceipt(txID)
	}

	// We don't have a mapping - try all shards
	for shardID := uint32(0); shardID < u.shardSize; shardID++ {
		fullShardID := u.shards[shardID].FullShardID
		txID := getTxIDWithShard(ethHash, fullShardID)

		result, err := u.getTransactionReceipt(txID)
		if err == nil && result != nil {
			return result, nil
		}
	}

	return nil, nil // Receipt not found
}

func (u *UnifiedShardAPI) getTransactionReceipt(txID []byte) (map[string]interface{}, error) {
	resp, err := u.client.Call("getTransactionReceipt", common.ToHex(txID))
	if err != nil {
		return nil, err
	}
	if resp.Result == nil {
		return nil, nil
	}

	ans, ok := resp.Result.(map[string]interface{})
	if !ok {
		return nil, nil
	}

	// Truncate contract address to 20 bytes
	if ans["contractAddress"] != nil {
		addrStr, ok := ans["contractAddress"].(string)
		if ok && len(addrStr) > 42 {
			ans["contractAddress"] = addrStr[:42]
		}
	}
	if ans["logsBloom"] == nil {
		ans["logsBloom"] = common.ToHex(make([]byte, types.BloomByteLength))
	}

	return ans, nil
}

// Call executes a call, routing based on the To address
func (u *UnifiedShardAPI) Call(mdata MetaCallArgs, blockNr string) (hexutil.Bytes, error) {
	arg := u.buildCallArg(mdata)

	resp, err := u.client.Call("call", arg, blockNr)
	if err != nil {
		return nil, err
	}

	resultStr, ok := resp.Result.(string)
	if !ok {
		return nil, errors.New("call failed")
	}
	return hexutil.Decode(resultStr)
}

// EstimateGas estimates gas for a transaction
func (u *UnifiedShardAPI) EstimateGas(mdata MetaCallArgs) (hexutil.Uint, error) {
	arg := u.buildCallArg(mdata)

	// estimateGas expects an array
	estimates := []map[string]interface{}{arg}

	resp, err := u.client.Call("estimateGas", estimates)
	if err != nil {
		return hexutil.Uint(21000), err
	}

	gasStr, ok := resp.Result.(string)
	if !ok {
		return hexutil.Uint(21000), errors.New("estimateGas failed")
	}

	gas, err := hexutil.DecodeUint64(gasStr)
	return hexutil.Uint(gas), err
}

// buildCallArg builds the call argument with proper shard routing
func (u *UnifiedShardAPI) buildCallArg(mdata MetaCallArgs) map[string]interface{} {
	defaultToken := hexutil.Uint64(35760)
	arg := make(map[string]interface{})

	// Route based on To address if present, otherwise From
	var routingAddr common.Address
	if mdata.To != nil {
		routingAddr = common.Address(*mdata.To)
	} else if mdata.From != nil {
		routingAddr = common.Address(*mdata.From)
	}

	fullShardKey := u.deriveFullShardKey(routingAddr)

	if mdata.From != nil {
		arg["from"] = account.Address{
			Recipient:    *mdata.From,
			FullShardKey: fullShardKey,
		}.ToHex()
	}
	if mdata.To != nil {
		arg["to"] = account.Address{
			Recipient:    *mdata.To,
			FullShardKey: fullShardKey,
		}.ToHex()
	}

	arg["gas"] = mdata.Gas
	arg["gasPrice"] = mdata.GasPrice
	arg["value"] = mdata.Value
	arg["data"] = mdata.Data
	arg["gas_token_id"] = &defaultToken
	arg["transfer_token_id"] = &defaultToken

	return arg
}
