package helper

import (
	"bytes"
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	ethTypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
	"github.com/pkg/errors"

	"github.com/giltchain/gilt-consensus/contracts/rootchain"
	"github.com/giltchain/gilt-consensus/contracts/slashmanager"
	"github.com/giltchain/gilt-consensus/contracts/stakinginfo"
	"github.com/giltchain/gilt-consensus/contracts/statereceiver"
	"github.com/giltchain/gilt-consensus/contracts/statesender"
	"github.com/giltchain/gilt-consensus/contracts/validatorset"
)

const (
	// smart contracts' events names

	NewHeaderBlockEvent = "NewHeaderBlock"
	TopUpFeeEvent       = "TopUpFee"
	StateSyncedEvent    = "StateSynced"
	SlashedEvent        = "Slashed"
	UnJailedEvent       = "UnJailed"
	StakedEvent         = "Staked"
	UnstakeInitEvent    = "UnstakeInit"
	UnstakedEvent       = "Unstaked"
	SignerChangeEvent   = "SignerChange"
	StakeUpdateEvent    = "StakeUpdate"
	RestakedEvent       = "Restaked"
	ShareMintedEvent    = "ShareMinted"
	ShareBurnedEvent    = "ShareBurned"

	// error messages

	errUnableToConnect = "unable to connect to gilt chain"
	errEventNotFound   = "event not found"
)

// ContractsABIsMap is a cached map holding the ABIs of the contracts
var ContractsABIsMap = make(map[string]*abi.ABI)

// IContractCaller represents contract caller
type IContractCaller interface {
	GetHeaderInfo(headerID uint64, rootChainInstance *rootchain.Rootchain, childBlockInterval uint64) (root common.Hash, start, end, createdAt uint64, proposer string, err error)
	GetRootHash(start, end, checkpointLength uint64) ([]byte, error)
	GetLastChildBlock(rootChainInstance *rootchain.Rootchain) (uint64, error)
	CurrentHeaderBlock(rootChainInstance *rootchain.Rootchain, childBlockInterval uint64) (uint64, error)
	GetBalance(address common.Address) (*big.Int, error)
	SendCheckpoint(signedData []byte, sigs [][3]*big.Int, rootChainAddress common.Address, rootChainInstance *rootchain.Rootchain) (err error)
	SendSlashRelay(data []byte, sigs [][3]*big.Int, stakeManagerAddress common.Address) error
	GetCheckpointSign(txHash common.Hash) ([]byte, []byte, []byte, error)
	GetMainChainBlock(*big.Int) (*ethTypes.Header, error)
	GetGiltChainBlock(context.Context, *big.Int) (*ethTypes.Header, error)
	GetGiltChainBlockAuthor(*big.Int) (*common.Address, error)
	IsTxConfirmed(common.Hash, uint64) bool
	GetConfirmedTxReceipt(common.Hash, uint64) (*ethTypes.Receipt, error)
	GetBlockNumberFromTxHash(common.Hash) (*big.Int, error)

	DecodeNewHeaderBlockEvent(string, *ethTypes.Receipt, uint64) (*rootchain.RootchainNewHeaderBlock, error)

	DecodeValidatorTopupFeesEvent(string, *ethTypes.Receipt, uint64) (*stakinginfo.StakinginfoTopUpFee, error)

	DecodeStateSyncedEvent(string, *ethTypes.Receipt, uint64) (*statesender.StatesenderStateSynced, error)

	DecodeSlashedEvent(string, *ethTypes.Receipt, uint64) (*stakinginfo.StakinginfoSlashed, error)
	DecodeUnJailedEvent(string, *ethTypes.Receipt, uint64) (*stakinginfo.StakinginfoUnJailed, error)

	GetMainTxReceipt(common.Hash) (*ethTypes.Receipt, error)
	GetGiltTxReceipt(common.Hash) (*ethTypes.Receipt, error)
	CurrentAccountStateRoot(stakingInfoInstance *stakinginfo.Stakinginfo) ([32]byte, error)
	CurrentStateCounter(stateSenderInstance *statesender.Statesender) (Number *big.Int)
	CheckIfBlocksExist(end uint64) (bool, error)
	GetRootChainInstance(rootChainAddress string) (*rootchain.Rootchain, error)
	GetStakingInfoInstance(stakingInfoAddress string) (*stakinginfo.Stakinginfo, error)
	GetSlashManagerInstance(slashManagerAddress string) (*slashmanager.Slashmanager, error)
	GetStateSenderInstance(stateSenderAddress string) (*statesender.Statesender, error)
	GetStateReceiverInstance(stateReceiverAddress string) (*statereceiver.Statereceiver, error)
}

// ContractCaller contract caller
type ContractCaller struct {
	MainChainClient  *ethclient.Client
	MainChainRPC     *rpc.Client
	MainChainTimeout time.Duration

	GiltChainClient    *ethclient.Client
	GiltChainRPCClient *rpc.Client
	GiltChainTimeout   time.Duration

	RootChainABI     abi.ABI
	StakingInfoABI   abi.ABI
	ValidatorSetABI  abi.ABI
	StateReceiverABI abi.ABI
	StateSenderABI   abi.ABI
	SlashManagerABI  abi.ABI

	ContractInstanceCache map[common.Address]interface{}
}

type txExtraInfo struct {
	BlockNumber *string         `json:"blockNumber,omitempty"`
	BlockHash   *common.Hash    `json:"blockHash,omitempty"`
	From        *common.Address `json:"from,omitempty"`
}

type rpcTransaction struct {
	txExtraInfo
}

// NewContractCaller contract caller
func NewContractCaller() (contractCallerObj ContractCaller, err error) {
	config := GetConfig()
	contractCallerObj.MainChainClient = GetMainClient()
	contractCallerObj.MainChainTimeout = config.EthRPCTimeout
	contractCallerObj.GiltChainClient = GetGiltClient()
	contractCallerObj.GiltChainTimeout = config.GiltRPCTimeout
	contractCallerObj.MainChainRPC = GetMainChainRPCClient()
	contractCallerObj.GiltChainRPCClient = GetGiltRPCClient()

	// listeners and processors instance cache (address->ABI)
	contractCallerObj.ContractInstanceCache = make(map[common.Address]interface{})
	// package global cache (string->ABI)
	if err = populateABIs(&contractCallerObj); err != nil {
		return contractCallerObj, err
	}

	return contractCallerObj, nil
}

// GetRootChainInstance returns the RootChain contract instance for a selected chain
func (c *ContractCaller) GetRootChainInstance(rootChainAddress string) (*rootchain.Rootchain, error) {
	address := common.HexToAddress(rootChainAddress)

	contractInstance, ok := c.ContractInstanceCache[address]
	if !ok {
		ci, err := rootchain.NewRootchain(address, mainChainClient)
		c.ContractInstanceCache[address] = ci

		if err != nil {
			Logger.Error("Error in fetching the root chain instance from mainChain client", "error", err)
			return nil, err
		}

		return ci, err
	}

	return contractInstance.(*rootchain.Rootchain), nil
}

// GetStakingInfoInstance returns stakingInfo contract instance for a selected chain
func (c *ContractCaller) GetStakingInfoInstance(stakingInfoAddress string) (*stakinginfo.Stakinginfo, error) {
	address := common.HexToAddress(stakingInfoAddress)

	contractInstance, ok := c.ContractInstanceCache[address]
	if !ok {
		ci, err := stakinginfo.NewStakinginfo(address, mainChainClient)
		c.ContractInstanceCache[address] = ci

		if err != nil {
			Logger.Error("Error in fetching the stakingInfo instance from mainChain client", "error", err)
			return nil, err
		}

		return ci, err
	}

	return contractInstance.(*stakinginfo.Stakinginfo), nil
}

// GetSlashManagerInstance returns the slashManager contract instance for a selected base chain
func (c *ContractCaller) GetSlashManagerInstance(slashManagerAddress string) (*slashmanager.Slashmanager, error) {
	address := common.HexToAddress(slashManagerAddress)

	contractInstance, ok := c.ContractInstanceCache[address]
	if !ok {
		ci, err := slashmanager.NewSlashmanager(address, mainChainClient)
		c.ContractInstanceCache[address] = ci

		if err != nil {
			Logger.Error("Error in fetching the slash manager from mainChain client", "error", err)
			return nil, err
		}

		return ci, err
	}

	return contractInstance.(*slashmanager.Slashmanager), nil
}

// GetStateSenderInstance returns stakingInfo contract instance for a selected base chain
func (c *ContractCaller) GetStateSenderInstance(stateSenderAddress string) (*statesender.Statesender, error) {
	address := common.HexToAddress(stateSenderAddress)

	contractInstance, ok := c.ContractInstanceCache[address]
	if !ok {
		ci, err := statesender.NewStatesender(address, mainChainClient)
		c.ContractInstanceCache[address] = ci

		if err != nil {
			Logger.Error("Error in fetching the stateSender from mainChain client", "error", err)
			return nil, err
		}

		return ci, err
	}

	return contractInstance.(*statesender.Statesender), nil
}

// GetStateReceiverInstance returns stakingInfo contract instance for a selected base chain
func (c *ContractCaller) GetStateReceiverInstance(stateReceiverAddress string) (*statereceiver.Statereceiver, error) {
	address := common.HexToAddress(stateReceiverAddress)

	contractInstance, ok := c.ContractInstanceCache[address]
	if !ok {
		ci, err := statereceiver.NewStatereceiver(address, giltClient)
		c.ContractInstanceCache[address] = ci

		if err != nil {
			Logger.Error("Error in fetching the stateReceiver from mainChain client", "error", err)
			return nil, err
		}

		return ci, err
	}

	return contractInstance.(*statereceiver.Statereceiver), nil
}

// GetHeaderInfo get header info from checkpoint number
func (c *ContractCaller) GetHeaderInfo(headerID uint64, rootChainInstance *rootchain.Rootchain, childBlockInterval uint64) (
	root common.Hash,
	start,
	end,
	createdAt uint64,
	proposer string,
	err error,
) {
	// get header from rootChain
	checkpointBigInt := big.NewInt(0).Mul(big.NewInt(0).SetUint64(headerID), big.NewInt(0).SetUint64(childBlockInterval))

	headerBlock, err := rootChainInstance.HeaderBlocks(nil, checkpointBigInt)
	if err != nil {
		return root, start, end, createdAt, proposer, errors.New("unable to fetch checkpoint block")
	}

	return headerBlock.Root,
		headerBlock.Start.Uint64(),
		headerBlock.End.Uint64(),
		headerBlock.CreatedAt.Uint64(),
		headerBlock.Proposer.String(),
		nil
}

// GetRootHash get root hash from the gilt chain for the corresponding start and end block
func (c *ContractCaller) GetRootHash(start, end, checkpointLength uint64) ([]byte, error) {
	noOfBlock := end - start + 1

	if start > end {
		return nil, errors.New("start is greater than end")
	}

	if noOfBlock > checkpointLength {
		return nil, errors.New("number of headers requested exceeds checkpoint length")
	}

	ctx, cancel := context.WithTimeout(context.Background(), c.GiltChainTimeout)
	defer cancel()

	rootHash, err := c.GiltChainClient.GetRootHash(ctx, start, end)

	if err != nil {
		Logger.Error("Could not fetch rootHash from gilt chain", "error", err)
		return nil, err
	}

	return common.FromHex(rootHash), nil
}

// GetLastChildBlock fetch current child block
func (c *ContractCaller) GetLastChildBlock(rootChainInstance *rootchain.Rootchain) (uint64, error) {
	lastChildBlock, err := rootChainInstance.GetLastChildBlock(nil)
	if err != nil {
		Logger.Error("Could not fetch current child block from rootChain contract", "error", err)
		return 0, err
	}

	if lastChildBlock == nil {
		Logger.Error("Contract returned nil value for lastChildBlock")
		return 0, fmt.Errorf("contract returned nil value")
	}

	return lastChildBlock.Uint64(), nil
}

// CurrentHeaderBlock fetches the current header block
func (c *ContractCaller) CurrentHeaderBlock(rootChainInstance *rootchain.Rootchain, childBlockInterval uint64) (uint64, error) {
	currentHeaderBlock, err := rootChainInstance.CurrentHeaderBlock(nil)
	if err != nil {
		Logger.Error("Could not fetch current header block from rootChain contract", "error", err)
		return 0, err
	}

	if currentHeaderBlock == nil {
		Logger.Error("Contract returned nil value for currentHeaderBlock")
		return 0, fmt.Errorf("contract returned nil value")
	}

	return currentHeaderBlock.Uint64() / childBlockInterval, nil
}

// GetBalance get balance of an account (returns big.Int balance won't fit in uint64)
func (c *ContractCaller) GetBalance(address common.Address) (*big.Int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.MainChainTimeout)
	defer cancel()

	balance, err := c.MainChainClient.BalanceAt(ctx, address, nil)
	if err != nil {
		Logger.Error("Unable to fetch balance of account from root chain", "Address", address.String(), "error", err)
		return big.NewInt(0), err
	}

	return balance, nil
}

// GetMainChainBlock returns main chain block header
func (c *ContractCaller) GetMainChainBlock(blockNum *big.Int) (header *ethTypes.Header, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.MainChainTimeout)
	defer cancel()

	latestBlock, err := c.MainChainClient.HeaderByNumber(ctx, blockNum)
	if err != nil {
		Logger.Error("Unable to connect to main chain", "error", err)
		return
	}

	return latestBlock, nil
}

// GetMainChainFinalizedBlock returns the finalized main chain block header (post-merge)
func (c *ContractCaller) GetMainChainFinalizedBlock() (header *ethTypes.Header, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.MainChainTimeout)
	defer cancel()

	latestFinalizedBlock, err := c.MainChainClient.HeaderByNumber(ctx, big.NewInt(int64(rpc.FinalizedBlockNumber)))
	if err != nil {
		Logger.Error(errUnableToConnect, "error", err)
		return
	}

	return latestFinalizedBlock, nil
}

// GetMainChainBlockTime returns main chain block time
func (c *ContractCaller) GetMainChainBlockTime(ctx context.Context, blockNum uint64) (time.Time, error) {
	ctx, cancel := context.WithTimeout(ctx, c.MainChainTimeout)
	defer cancel()

	latestBlock, err := c.MainChainClient.BlockByNumber(ctx, big.NewInt(0).SetUint64(blockNum))
	if err != nil {
		Logger.Error(errUnableToConnect, "error", err)
		return time.Time{}, err
	}

	return time.Unix(int64(latestBlock.Time()), 0), nil
}

// GetGiltChainFinalizedNumber returns the Parlia finalized block number at the current head.
func (c *ContractCaller) GetGiltChainFinalizedNumber(ctx context.Context) (uint64, error) {
	ctx, cancel := context.WithTimeout(ctx, c.GiltChainTimeout)
	defer cancel()

	var finalizedNumber hexutil.Uint64
	err := c.GiltChainClient.Client().CallContext(ctx, &finalizedNumber, "parlia_getFinalizedNumber", "latest")
	if err != nil {
		Logger.Error("Unable to fetch Parlia finalized number from gilt chain", "error", err)
		return 0, err
	}

	return uint64(finalizedNumber), nil
}

// GetGiltChainFinalizedBlock returns the Parlia finalized block header.
func (c *ContractCaller) GetGiltChainFinalizedBlock(ctx context.Context) (*ethTypes.Header, error) {
	finalizedNumber, err := c.GetGiltChainFinalizedNumber(ctx)
	if err != nil {
		return nil, err
	}

	return c.GetGiltChainBlock(ctx, big.NewInt(0).SetUint64(finalizedNumber))
}

// GetGiltChainBlock returns gilt chain block header
func (c *ContractCaller) GetGiltChainBlock(ctx context.Context, blockNum *big.Int) (header *ethTypes.Header, err error) {
	ctx, cancel := context.WithTimeout(ctx, c.GiltChainTimeout)
	defer cancel()

	latestBlock, err := c.GiltChainClient.HeaderByNumber(ctx, blockNum)

	if err != nil {
		Logger.Error(errUnableToConnect, "error", err)
		return
	}

	return latestBlock, nil
}

// GetGiltChainBlockAuthor returns the producer of the gilt block
func (c *ContractCaller) GetGiltChainBlockAuthor(blockNum *big.Int) (*common.Address, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.GiltChainTimeout)
	defer cancel()

	var author *common.Address
	err := c.GiltChainClient.Client().CallContext(ctx, &author, "parlia_getAuthor", toBlockNumArg(blockNum))
	if err != nil {
		Logger.Error(errUnableToConnect, "error", err)
		return nil, err
	}

	if author == nil {
		return nil, ethereum.NotFound
	}

	return author, nil
}

// GetBlockNumberFromTxHash gets the block number of transaction
func (c *ContractCaller) GetBlockNumberFromTxHash(tx common.Hash) (*big.Int, error) {
	var rpcTx rpcTransaction
	if err := c.MainChainRPC.CallContext(context.Background(), &rpcTx, "eth_getTransactionByHash", tx); err != nil {
		return nil, err
	}

	if rpcTx.BlockNumber == nil {
		return nil, errors.New("no tx found")
	}

	blkNum := big.NewInt(0)

	blkNum, ok := blkNum.SetString(*rpcTx.BlockNumber, 0)
	if !ok {
		return nil, errors.New("unable to set string")
	}

	return blkNum, nil
}

// IsTxConfirmed checks whether the tx corresponding to the given hash is confirmed with given
// requiredConfirmations numbers
func (c *ContractCaller) IsTxConfirmed(txHash common.Hash, requiredConfirmations uint64) bool {
	// get main tx receipt
	receipt, err := c.GetConfirmedTxReceipt(txHash, requiredConfirmations)
	if err != nil {
		Logger.Error("Error while fetching the tx receipt", "error", err)
		return false
	}

	return receipt != nil
}

// GetConfirmedTxReceipt returns a tx receipt only if it is finalized (or has the required confirmations).
func (c *ContractCaller) GetConfirmedTxReceipt(tx common.Hash, requiredConfirmations uint64) (*ethTypes.Receipt, error) {
	// Always fetch the receipt from the ethereum chain
	receipt, err := c.GetMainTxReceipt(tx)
	if err != nil {
		Logger.Error("Error while fetching receipt from ethereum", "txHash", tx.Hex(), "error", err)
		return nil, err
	}

	if receipt == nil {
		// should not happen, in case treat it as tx not found, hence possibly reorged out.
		Logger.Error("Tx receipt not found on ethereum chain", "txHash", tx.Hex())
		return nil, errors.New("ethereum tx receipt not found")
	}

	receiptBlockNumber := receipt.BlockNumber.Uint64()

	Logger.Debug("Tx included in block", "block", receiptBlockNumber, "tx", tx)

	// fetch the last finalized main chain block (available post-merge)
	latestFinalizedBlock, err := c.GetMainChainFinalizedBlock()
	if err != nil {
		Logger.Error("Error getting latest finalized block from main chain", "error", err)
	}

	// If the latest finalized block is available, use it to check if the receipt is finalized or not.
	// Else, fallback to the `requiredConfirmations` value
	if latestFinalizedBlock != nil {
		Logger.Debug("Latest finalized block on main chain obtained",
			"block", latestFinalizedBlock.Number.Uint64(),
			"receiptBlock", receiptBlockNumber,
		)

		if receiptBlockNumber > latestFinalizedBlock.Number.Uint64() {
			return nil, errors.New("not enough confirmations for this block")
		}

		// At this point we trust the canonical chain
		return receipt, nil
	}

	// No finalized API: fall back to N confirmations
	latestBlk, err := c.GetMainChainBlock(nil)
	if err != nil {
		Logger.Error("Error getting latest block from ethereum chain", "error", err)
		return nil, err
	}

	Logger.Debug("Latest block on ethereum chain obtained",
		"block", latestBlk.Number.Uint64(),
		"receiptBlock", receiptBlockNumber,
	)

	diff := latestBlk.Number.Uint64() - receiptBlockNumber
	if diff < requiredConfirmations {
		return nil, errors.New("not enough confirmations")
	}

	return receipt, nil
}

//
// Validator decode events
//

// DecodeNewHeaderBlockEvent represents the new header block event
func (c *ContractCaller) DecodeNewHeaderBlockEvent(contractAddressString string, receipt *ethTypes.Receipt, logIndex uint64) (*rootchain.RootchainNewHeaderBlock, error) {
	event := new(rootchain.RootchainNewHeaderBlock)

	contractAddress := common.HexToAddress(contractAddressString)

	for _, vLog := range receipt.Logs {
		if uint64(vLog.Index) == logIndex && bytes.Equal(vLog.Address.Bytes(), contractAddress.Bytes()) {
			if err := UnpackLog(&c.RootChainABI, event, NewHeaderBlockEvent, vLog); err != nil {
				return nil, err
			}

			return event, nil
		}
	}

	return nil, errors.New(errEventNotFound)
}

// DecodeValidatorTopupFeesEvent represents topUp for fees tokens
func (c *ContractCaller) DecodeValidatorTopupFeesEvent(contractAddressString string, receipt *ethTypes.Receipt, logIndex uint64) (*stakinginfo.StakinginfoTopUpFee, error) {
	event := new(stakinginfo.StakinginfoTopUpFee)

	contractAddress := common.HexToAddress(contractAddressString)

	for _, vLog := range receipt.Logs {
		if uint64(vLog.Index) == logIndex && bytes.Equal(vLog.Address.Bytes(), contractAddress.Bytes()) {
			if err := UnpackLog(&c.StakingInfoABI, event, TopUpFeeEvent, vLog); err != nil {
				return nil, err
			}

			return event, nil
		}
	}

	return nil, errors.New(errEventNotFound)
}

// DecodeStateSyncedEvent decode state sync data
func (c *ContractCaller) DecodeStateSyncedEvent(contractAddressString string, receipt *ethTypes.Receipt, logIndex uint64) (*statesender.StatesenderStateSynced, error) {
	event := new(statesender.StatesenderStateSynced)

	contractAddress := common.HexToAddress(contractAddressString)

	for _, vLog := range receipt.Logs {
		if uint64(vLog.Index) == logIndex && bytes.Equal(vLog.Address.Bytes(), contractAddress.Bytes()) {
			if err := UnpackLog(&c.StateSenderABI, event, StateSyncedEvent, vLog); err != nil {
				return nil, err
			}

			return event, nil
		}
	}

	return nil, errors.New(errEventNotFound)
}

// decode slashing events

// DecodeSlashedEvent represents tick ack on contract
func (c *ContractCaller) DecodeSlashedEvent(contractAddressString string, receipt *ethTypes.Receipt, logIndex uint64) (*stakinginfo.StakinginfoSlashed, error) {
	event := new(stakinginfo.StakinginfoSlashed)

	contractAddress := common.HexToAddress(contractAddressString)

	for _, vLog := range receipt.Logs {
		if uint64(vLog.Index) == logIndex && bytes.Equal(vLog.Address.Bytes(), contractAddress.Bytes()) {
			if err := UnpackLog(&c.StakingInfoABI, event, SlashedEvent, vLog); err != nil {
				return nil, err
			}

			return event, nil
		}
	}

	return nil, errors.New(errEventNotFound)
}

// DecodeUnJailedEvent represents unJail on contract
func (c *ContractCaller) DecodeUnJailedEvent(contractAddressString string, receipt *ethTypes.Receipt, logIndex uint64) (*stakinginfo.StakinginfoUnJailed, error) {
	event := new(stakinginfo.StakinginfoUnJailed)

	contractAddress := common.HexToAddress(contractAddressString)

	for _, vLog := range receipt.Logs {
		if uint64(vLog.Index) == logIndex && bytes.Equal(vLog.Address.Bytes(), contractAddress.Bytes()) {
			if err := UnpackLog(&c.StakingInfoABI, event, UnJailedEvent, vLog); err != nil {
				return nil, err
			}

			return event, nil
		}
	}

	return nil, errors.New(errEventNotFound)
}

//
// Account root functions
//

// CurrentAccountStateRoot get current account root from on the chain
func (c *ContractCaller) CurrentAccountStateRoot(stakingInfoInstance *stakinginfo.Stakinginfo) ([32]byte, error) {
	accountStateRoot, err := stakingInfoInstance.GetAccountStateRoot(nil)
	if err != nil {
		Logger.Error("Unable to get current account state root", "error", err)

		var emptyArr [32]byte

		return emptyArr, err
	}

	return accountStateRoot, nil
}

// CurrentStateCounter get state counter
func (c *ContractCaller) CurrentStateCounter(stateSenderInstance *statesender.Statesender) (Number *big.Int) {
	result, err := stateSenderInstance.Counter(nil)
	if err != nil {
		Logger.Error("Unable to get current counter number", "error", err)
		return nil
	}

	return result
}

// CheckIfBlocksExist - check if the given block number exists on the local chain.
// Here we check if the block number exists by fetching the header from the gilt chain.
func (c *ContractCaller) CheckIfBlocksExist(number uint64) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.GiltChainTimeout)
	defer cancel()

	header, err := c.GiltChainClient.HeaderByNumber(ctx, big.NewInt(int64(number)))
	if err != nil {
		if errors.Is(err, ethereum.NotFound) {
			return false, nil
		}
		return false, err
	}
	if header == nil || header.Number == nil {
		return false, nil
	}

	return number == header.Number.Uint64(), nil
}

// GetBlockByNumber returns blocks by number from the child chain (gilt)
func (c *ContractCaller) GetBlockByNumber(ctx context.Context, blockNumber uint64) (*ethTypes.Block, error) {
	block, err := c.GiltChainClient.BlockByNumber(ctx, big.NewInt(int64(blockNumber)))

	if err != nil {
		Logger.Error("Unable to fetch block by number from child chain", "block", block, "err", err)
		return nil, err
	}

	return block, nil
}

//
// Receipt functions
//

// GetMainTxReceipt returns main tx receipt
func (c *ContractCaller) GetMainTxReceipt(txHash common.Hash) (*ethTypes.Receipt, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.MainChainTimeout)
	defer cancel()

	return c.getTxReceipt(ctx, c.MainChainClient, txHash)
}

// getTxReceipt returns a transaction receipt from the given eth client.
func (c *ContractCaller) getTxReceipt(ctx context.Context, client *ethclient.Client, txHash common.Hash) (*ethTypes.Receipt, error) {
	return client.TransactionReceipt(ctx, txHash)
}

// GetGiltTxReceipt returns gilt tx receipt
func (c *ContractCaller) GetGiltTxReceipt(txHash common.Hash) (*ethTypes.Receipt, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.GiltChainTimeout)
	defer cancel()

	return c.getTxReceipt(ctx, c.GiltChainClient, txHash)
}

// GetCheckpointSign returns sigs input of committed checkpoint transaction
func (c *ContractCaller) GetCheckpointSign(txHash common.Hash) ([]byte, []byte, []byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.MainChainTimeout)
	defer cancel()

	mainChainClient := GetMainClient()

	transaction, isPending, err := mainChainClient.TransactionByHash(ctx, txHash)
	if err != nil {
		Logger.Error("Error while fetching transaction by hash from MainChain", "error", err)
		return []byte{}, []byte{}, []byte{}, err
	} else if isPending {
		return []byte{}, []byte{}, []byte{}, errors.New("transaction is still pending")
	}

	payload := transaction.Data()
	chainABI := c.RootChainABI

	return UnpackSigAndVotes(payload, chainABI)
}

// utility and helper methods

// populateABIs fills the package level cache for contracts' ABIs.
// When called the first time, ContractsABIsMap will be filled,
// and the getABI method won't be invoked the next time.
// This reduces the number of calls to JSON decode methods made by the contract caller.
// It uses ABIs' definitions instead of contracts' addresses,
// as the latter might not be available at initialization time
func populateABIs(contractCallerObj *ContractCaller) error {
	var ccAbi *abi.ABI

	var err error

	contractsABIs := [6]string{
		rootchain.RootchainMetaData.ABI, stakinginfo.StakinginfoMetaData.ABI, validatorset.ValidatorsetMetaData.ABI,
		statereceiver.StatereceiverMetaData.ABI, statesender.StatesenderMetaData.ABI, slashmanager.SlashmanagerMetaData.ABI,
	}

	// iterate over supported ABIs
	for _, contractABI := range contractsABIs {
		ccAbi, err = chooseContractCallerABI(contractCallerObj, contractABI)
		if err != nil {
			Logger.Error("Error while fetching contract caller ABI", "error", err)
			return err
		}

		if ContractsABIsMap[contractABI] == nil {
			// fills cached abi map
			if *ccAbi, err = getABI(contractABI); err != nil {
				Logger.Error("Error while getting ABI for contract caller", "name", contractABI, "error", err)
				return err
			}
			ContractsABIsMap[contractABI] = ccAbi
		} else {
			// use cached abi
			*ccAbi = *ContractsABIsMap[contractABI]
		}
	}

	return nil
}

// chooseContractCallerABI extracts and returns the abo.ABI object from the contractCallerObj based on its abi string
func chooseContractCallerABI(contractCallerObj *ContractCaller, abi string) (*abi.ABI, error) {
	switch abi {
	case rootchain.RootchainMetaData.ABI:
		return &contractCallerObj.RootChainABI, nil
	case stakinginfo.StakinginfoMetaData.ABI:
		return &contractCallerObj.StakingInfoABI, nil
	case validatorset.ValidatorsetMetaData.ABI:
		return &contractCallerObj.ValidatorSetABI, nil
	case statereceiver.StatereceiverMetaData.ABI:
		return &contractCallerObj.StateReceiverABI, nil
	case statesender.StatesenderMetaData.ABI:
		return &contractCallerObj.StateSenderABI, nil
	case slashmanager.SlashmanagerMetaData.ABI:
		return &contractCallerObj.SlashManagerABI, nil
	}

	return nil, errors.New("no ABI associated with such data")
}

// getABI returns the contract's ABI struct from on its JSON representation
func getABI(data string) (abi.ABI, error) {
	return abi.JSON(strings.NewReader(data))
}

// copied from gilt/ethclient package
func toBlockNumArg(number *big.Int) string {
	if number == nil {
		return "latest"
	}
	if number.Sign() >= 0 {
		return hexutil.EncodeBig(number)
	}
	// It's negative.
	if number.IsInt64() {
		return rpc.BlockNumber(number.Int64()).String()
	}
	// It's negative and large, which is invalid.
	return fmt.Sprintf("<invalid %d>", number)
}
