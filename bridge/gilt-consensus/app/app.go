package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"
	reflectionv1 "cosmossdk.io/api/cosmos/reflection/v1"
	"cosmossdk.io/client/v2/autocli"
	"cosmossdk.io/collections"
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/log"
	storetypes "cosmossdk.io/store/types"
	"cosmossdk.io/x/tx/signing"
	abci "github.com/cometbft/cometbft/abci/types"
	cmtproto "github.com/cometbft/cometbft/proto/tendermint/types"
	dbm "github.com/cosmos/cosmos-db"
	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/grpc/cmtservice"
	nodeservice "github.com/cosmos/cosmos-sdk/client/grpc/node"
	"github.com/cosmos/cosmos-sdk/codec"
	"github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	runtimeservices "github.com/cosmos/cosmos-sdk/runtime/services"
	"github.com/cosmos/cosmos-sdk/server"
	"github.com/cosmos/cosmos-sdk/server/api"
	"github.com/cosmos/cosmos-sdk/server/config"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	"github.com/cosmos/cosmos-sdk/std"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
	"github.com/cosmos/cosmos-sdk/version"
	"github.com/cosmos/cosmos-sdk/x/auth"
	"github.com/cosmos/cosmos-sdk/x/auth/ante"
	authcodec "github.com/cosmos/cosmos-sdk/x/auth/codec"
	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	"github.com/cosmos/cosmos-sdk/x/auth/posthandler"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/cosmos/cosmos-sdk/x/bank"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/cosmos/cosmos-sdk/x/consensus"
	consensusparamkeeper "github.com/cosmos/cosmos-sdk/x/consensus/keeper"
	consensusparamtypes "github.com/cosmos/cosmos-sdk/x/consensus/types"
	"github.com/cosmos/cosmos-sdk/x/gov"
	govclient "github.com/cosmos/cosmos-sdk/x/gov/client"
	govkeeper "github.com/cosmos/cosmos-sdk/x/gov/keeper"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"
	govv1beta1 "github.com/cosmos/cosmos-sdk/x/gov/types/v1beta1"
	"github.com/cosmos/cosmos-sdk/x/params"
	paramsclient "github.com/cosmos/cosmos-sdk/x/params/client"
	paramskeeper "github.com/cosmos/cosmos-sdk/x/params/keeper"
	paramstypes "github.com/cosmos/cosmos-sdk/x/params/types"
	paramproposal "github.com/cosmos/cosmos-sdk/x/params/types/proposal"
	"github.com/cosmos/gogoproto/proto"
	"github.com/gorilla/mux"
	"github.com/hellofresh/health-go/v5"

	"github.com/giltchain/gilt-consensus/client/docs"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/giltchain/gilt-consensus/metrics"
	"github.com/giltchain/gilt-consensus/sidetxs"
	hmTypes "github.com/giltchain/gilt-consensus/types"
	hversion "github.com/giltchain/gilt-consensus/version"
	"github.com/giltchain/gilt-consensus/x/chainmanager"
	chainmanagerkeeper "github.com/giltchain/gilt-consensus/x/chainmanager/keeper"
	chainmanagertypes "github.com/giltchain/gilt-consensus/x/chainmanager/types"
	"github.com/giltchain/gilt-consensus/x/checkpoint"
	checkpointKeeper "github.com/giltchain/gilt-consensus/x/checkpoint/keeper"
	checkpointTypes "github.com/giltchain/gilt-consensus/x/checkpoint/types"
	"github.com/giltchain/gilt-consensus/x/clerk"
	clerkkeeper "github.com/giltchain/gilt-consensus/x/clerk/keeper"
	clerktypes "github.com/giltchain/gilt-consensus/x/clerk/types"
	"github.com/giltchain/gilt-consensus/x/pricefeed"
	pricefeedKeeper "github.com/giltchain/gilt-consensus/x/pricefeed/keeper"
	pricefeedTypes "github.com/giltchain/gilt-consensus/x/pricefeed/types"
	"github.com/giltchain/gilt-consensus/x/stake"
	stakeKeeper "github.com/giltchain/gilt-consensus/x/stake/keeper"
	staketypes "github.com/giltchain/gilt-consensus/x/stake/types"
	"github.com/giltchain/gilt-consensus/x/topup"
	topupKeeper "github.com/giltchain/gilt-consensus/x/topup/keeper"
	topupTypes "github.com/giltchain/gilt-consensus/x/topup/types"
)

const (
	GiltConsensusAppName = "giltconsensusapp"

	// HTTP header constants
	headerContentType       = "Content-Type"
	mimeTypeApplicationJSON = "application/json"
)

var (
	DefaultNodeHome string
	// maccPerms represent the module accounts' permissions
	maccPerms = map[string][]string{
		authtypes.FeeCollectorName: nil,
		govtypes.ModuleName:        nil,
		staketypes.ModuleName:      nil,
		topupTypes.ModuleName:      {authtypes.Minter, authtypes.Burner},
	}
)

var (
	_ runtime.AppI            = (*GiltConsensusApp)(nil)
	_ servertypes.Application = (*GiltConsensusApp)(nil)
)

type GiltConsensusApp struct {
	*baseapp.BaseApp

	legacyAmino       *codec.LegacyAmino
	appCodec          codec.Codec
	txConfig          client.TxConfig
	interfaceRegistry types.InterfaceRegistry

	keys    map[string]*storetypes.KVStoreKey
	tKeys   map[string]*storetypes.TransientStoreKey
	memKeys map[string]*storetypes.MemoryStoreKey

	// keepers
	AccountKeeper         authkeeper.AccountKeeper
	BankKeeper            bankkeeper.Keeper
	GovKeeper             govkeeper.Keeper
	ParamsKeeper          paramskeeper.Keeper
	ConsensusParamsKeeper consensusparamkeeper.Keeper

	// Custom Keepers
	ClerkKeeper        clerkkeeper.Keeper
	StakeKeeper        stakeKeeper.Keeper
	TopupKeeper        topupKeeper.Keeper
	ChainManagerKeeper chainmanagerkeeper.Keeper
	CheckpointKeeper   checkpointKeeper.Keeper
	PriceFeedKeeper    pricefeedKeeper.Keeper

	// utility for invoking contracts in the Ethereum and Gilt chains
	caller helper.IContractCaller

	ModuleManager *module.Manager
	BasicManager  module.BasicManager

	simulationManager *module.SimulationManager

	configurator module.Configurator

	// SideTxConfigurator
	sideTxCfg sidetxs.SideTxConfigurator

	// Health service
	healthService *health.Health
}

func init() {
	DefaultNodeHome = filepath.Join("/var/lib/gilt-consensus")
}

func NewGiltConsensusApp(
	logger log.Logger,
	db dbm.DB,
	traceStore io.Writer,
	loadLatest bool,
	appOpts servertypes.AppOptions,
	baseAppOptions ...func(*baseapp.BaseApp),
) *GiltConsensusApp {
	interfaceRegistry, err := types.NewInterfaceRegistryWithOptions(types.InterfaceRegistryOptions{
		ProtoFiles: proto.HybridResolver,
		SigningOptions: signing.Options{
			AddressCodec:          address.HexCodec{},
			ValidatorAddressCodec: address.HexCodec{},
		},
	})
	if err != nil {
		panic(err)
	}

	appCodec := codec.NewProtoCodec(interfaceRegistry)
	legacyAmino := codec.NewLegacyAmino()
	txConfig := authtx.NewTxConfig(appCodec, authtx.DefaultSignModes)

	std.RegisterLegacyAminoCodec(legacyAmino)
	std.RegisterInterfaces(interfaceRegistry)

	bApp := baseapp.NewBaseApp(GiltConsensusAppName, logger, db, txConfig.TxDecoder(), baseAppOptions...)
	bApp.SetCommitMultiStoreTracer(traceStore)
	bApp.SetVersion(version.Version)
	bApp.SetInterfaceRegistry(interfaceRegistry)
	bApp.SetTxEncoder(txConfig.TxEncoder())

	keys := storetypes.NewKVStoreKeys(
		authtypes.StoreKey,
		banktypes.StoreKey,
		consensusparamtypes.StoreKey,
		govtypes.StoreKey,
		paramstypes.StoreKey,
		clerktypes.StoreKey,
		staketypes.StoreKey,
		checkpointTypes.StoreKey,
		topupTypes.StoreKey,
		chainmanagertypes.StoreKey,
		pricefeedTypes.StoreKey,
	)

	// register streaming services
	if err := bApp.RegisterStreamingServices(appOpts, keys); err != nil {
		panic(err)
	}

	tKeys := storetypes.NewTransientStoreKeys(paramstypes.TStoreKey)

	app := &GiltConsensusApp{
		BaseApp:           bApp,
		legacyAmino:       legacyAmino,
		txConfig:          txConfig,
		appCodec:          appCodec,
		interfaceRegistry: interfaceRegistry,
		keys:              keys,
		tKeys:             tKeys,
	}

	// Contract caller
	contractCallerObj, err := helper.NewContractCaller()
	if err != nil {
		panic(err)
	}

	app.caller = &contractCallerObj

	moduleAccountAddresses := app.ModuleAccountAddrs()
	blockedAddr := app.BlockedModuleAccountAddrs(moduleAccountAddresses)

	// Set ABCI++ Handlers
	bApp.SetPrepareProposal(app.NewPrepareProposalHandler())
	bApp.SetProcessProposal(app.NewProcessProposalHandler())

	// set the BaseApp's parameter store
	app.ParamsKeeper = initParamsKeeper(appCodec, legacyAmino, keys[paramstypes.StoreKey], tKeys[paramstypes.TStoreKey])
	app.ConsensusParamsKeeper = consensusparamkeeper.NewKeeper(appCodec, runtime.NewKVStoreService(keys[consensusparamtypes.StoreKey]), authtypes.NewModuleAddress(govtypes.ModuleName).String(), runtime.EventService{})
	bApp.SetParamStore(app.ConsensusParamsKeeper.ParamsStore)

	app.AccountKeeper = authkeeper.NewAccountKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[authtypes.StoreKey]),
		authtypes.ProtoBaseAccount,
		maccPerms,
		authcodec.NewHexCodec(),
		authtypes.NewModuleAddress(govtypes.ModuleName).String(),
	)

	app.ChainManagerKeeper = chainmanagerkeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[chainmanagertypes.StoreKey]),
		authtypes.NewModuleAddress(govtypes.ModuleName).String(),
	)

	app.ClerkKeeper = clerkkeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[clerktypes.StoreKey]),
		app.ChainManagerKeeper,
		app.caller,
	)

	app.BankKeeper = bankkeeper.NewBaseKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[banktypes.StoreKey]),
		app.AccountKeeper,
		blockedAddr,
		authtypes.NewModuleAddress(govtypes.ModuleName).String(),
		logger,
	)

	app.TopupKeeper = topupKeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[topupTypes.StoreKey]),
		app.BankKeeper,
		app.ChainManagerKeeper,
		app.caller,
	)

	app.PriceFeedKeeper = pricefeedKeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[pricefeedTypes.StoreKey]),
		authtypes.NewModuleAddress(govtypes.ModuleName).String(),
	)

	app.StakeKeeper = stakeKeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[staketypes.StoreKey]),
		app.BankKeeper,
		app.ChainManagerKeeper,
		address.HexCodec{},
		app.caller,
	)

	govRouter := govv1beta1.NewRouter()
	govRouter.AddRoute(govtypes.RouterKey, govv1beta1.ProposalHandler).
		AddRoute(paramproposal.RouterKey, params.NewParamChangeProposalHandler(app.ParamsKeeper))
	govConfig := govtypes.DefaultConfig()
	govKeeper := govkeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[govtypes.StoreKey]),
		app.AccountKeeper,
		app.BankKeeper,
		&app.StakeKeeper,
		nil,
		app.MsgServiceRouter(),
		govConfig,
		authtypes.NewModuleAddress(govtypes.ModuleName).String(),
	)
	// Set legacy router for backwards compatibility with gov v1beta1
	govKeeper.SetLegacyRouter(govRouter)
	app.GovKeeper = *govKeeper.SetHooks(
		govtypes.NewMultiGovHooks())

	app.CheckpointKeeper = checkpointKeeper.NewKeeper(
		appCodec,
		runtime.NewKVStoreService(keys[checkpointTypes.StoreKey]),
		authtypes.NewModuleAddress(govtypes.ModuleName).String(),
		&app.StakeKeeper,
		app.ChainManagerKeeper,
		&app.TopupKeeper,
		app.caller,
	)

	// HV2: stake and checkpoint keepers are circularly dependent. This workaround solves it
	app.StakeKeeper.SetPricefeedKeeper(app.PriceFeedKeeper)
	app.StakeKeeper.SetCheckpointKeeper(app.CheckpointKeeper)

	app.ModuleManager = module.NewManager(
		auth.NewAppModule(appCodec, app.AccountKeeper, nil, app.GetSubspace(authtypes.ModuleName)),
		bank.NewAppModule(appCodec, app.BankKeeper, app.AccountKeeper, app.GetSubspace(banktypes.ModuleName)),
		gov.NewAppModule(appCodec, &app.GovKeeper, app.AccountKeeper, app.BankKeeper, app.GetSubspace(govtypes.ModuleName)),
		stake.NewAppModule(app.StakeKeeper, app.caller),
		pricefeed.NewAppModule(app.PriceFeedKeeper),
		clerk.NewAppModule(app.ClerkKeeper),
		chainmanager.NewAppModule(app.ChainManagerKeeper),
		topup.NewAppModule(app.TopupKeeper, app.caller),
		checkpoint.NewAppModule(&app.CheckpointKeeper),
		params.NewAppModule(app.ParamsKeeper),
		consensus.NewAppModule(appCodec, app.ConsensusParamsKeeper),
	)

	// Basic manager
	app.BasicManager = module.NewBasicManagerFromManager(
		app.ModuleManager,
		map[string]module.AppModuleBasic{
			govtypes.ModuleName: gov.NewAppModuleBasic(
				[]govclient.ProposalHandler{
					paramsclient.ProposalHandler,
				},
			),
		})

	app.BasicManager.RegisterLegacyAminoCodec(legacyAmino)
	app.BasicManager.RegisterInterfaces(interfaceRegistry)

	app.sideTxCfg = sidetxs.NewSideTxConfigurator()
	app.RegisterSideMsgServices(app.sideTxCfg)

	// Set the voteExtension methods to GiltConsensusApp
	bApp.SetExtendVoteHandler(app.ExtendVoteHandler())
	bApp.SetVerifyVoteExtensionHandler(app.VerifyVoteExtensionHandler())

	app.ModuleManager.SetOrderBeginBlockers(
		staketypes.ModuleName,
	)

	app.ModuleManager.SetOrderEndBlockers(
		govtypes.ModuleName,
		staketypes.ModuleName,
	)

	genesisModuleOrder := []string{
		authtypes.ModuleName,
		banktypes.ModuleName,
		govtypes.ModuleName,
		chainmanagertypes.ModuleName,
		pricefeedTypes.ModuleName,
		staketypes.ModuleName,
		checkpointTypes.ModuleName,
		clerktypes.ModuleName,
		topupTypes.ModuleName,
		paramstypes.ModuleName,
		consensusparamtypes.ModuleName,
	}

	app.ModuleManager.SetOrderInitGenesis(genesisModuleOrder...)
	app.ModuleManager.SetOrderExportGenesis(genesisModuleOrder...)

	app.configurator = module.NewConfigurator(
		app.appCodec,
		app.MsgServiceRouter(),
		app.GRPCQueryRouter(),
	)
	err = app.ModuleManager.RegisterServices(app.configurator)
	if err != nil {
		panic(err)
	}

	autocliv1.RegisterQueryServer(app.GRPCQueryRouter(), runtimeservices.NewAutoCLIQueryService(app.ModuleManager.Modules))

	reflectionSvc, err := runtimeservices.NewReflectionService()
	if err != nil {
		panic(err)
	}
	reflectionv1.RegisterReflectionServiceServer(app.GRPCQueryRouter(), reflectionSvc)

	// initialize stores
	app.MountKVStores(keys)
	app.MountTransientStores(tKeys)
	// initialize BaseApp
	app.SetInitChainer(app.InitChainer)
	app.SetPreBlocker(app.PreBlocker)
	app.SetBeginBlocker(app.BeginBlocker)
	app.SetEndBlocker(app.EndBlocker)
	app.setAnteHandler(txConfig, app.sideTxCfg)
	app.setPostHandler()

	// At startup, after all modules have been registered, check that all proto
	// annotations are correct.
	protoFiles, err := proto.MergedRegistry()
	if err != nil {
		panic(err)
	}
	err = msgservice.ValidateProtoAnnotations(protoFiles)
	if err != nil {
		// Once we switch to using protoreflect-based ante handlers, we might
		// want to panic here instead of logging a warning.
		_, err := fmt.Fprintln(os.Stderr, err.Error())
		if err != nil {
			fmt.Println("could not write to stderr")
		}
	}

	if loadLatest {
		if err := app.LoadLatestVersion(); err != nil {
			panic(fmt.Errorf("error loading last version: %w", err))
		}
	}

	metrics.InitMetrics()

	// Initialize the health service.
	healthService, err := health.New(
		health.WithComponent(health.Component{
			Name:    "giltconsensus",
			Version: hversion.Version,
		}),
		health.WithSystemInfo(),
	)
	if err != nil {
		panic(fmt.Errorf("failed to create health service: %w", err))
	}
	app.healthService = healthService

	return app
}

func (app *GiltConsensusApp) CheckTx(req *abci.RequestCheckTx) (*abci.ResponseCheckTx, error) {
	return app.BaseApp.CheckTx(req)
}

func (app *GiltConsensusApp) setAnteHandler(txConfig client.TxConfig, sideTxConfig sidetxs.SideTxConfigurator) {
	anteHandler, err := NewAnteHandler(
		HandlerOptions{
			HandlerOptions: ante.HandlerOptions{
				AccountKeeper:   app.AccountKeeper,
				BankKeeper:      app.BankKeeper,
				SignModeHandler: txConfig.SignModeHandler(),
				SigGasConsumer:  ante.DefaultSigVerificationGasConsumer,
			},
			SideTxConfig: sideTxConfig,
		},
	)
	if err != nil {
		panic(err)
	}

	// Set the AnteHandler for the app
	app.SetAnteHandler(anteHandler)
}

func (app *GiltConsensusApp) setPostHandler() {
	postHandler, err := posthandler.NewPostHandler(
		posthandler.HandlerOptions{},
	)
	if err != nil {
		panic(err)
	}

	app.SetPostHandler(postHandler)
}

func (app *GiltConsensusApp) Name() string { return app.BaseApp.Name() }

// InitChainer application update at chain initialization
func (app *GiltConsensusApp) InitChainer(ctx sdk.Context, req *abci.RequestInitChain) (*abci.ResponseInitChain, error) {
	var genesisState GenesisState
	if err := json.Unmarshal(req.AppStateBytes, &genesisState); err != nil {
		panic(err)
	}

	// get validator updates
	if err := app.BasicManager.ValidateGenesis(app.AppCodec(), app.txConfig, genesisState); err != nil {
		panic(err)
	}

	// Get chainManagerGenesisState
	chainManagerGenesis := genesisState[chainmanagertypes.ModuleName]
	var chainManagerGenesisState chainmanagertypes.GenesisState
	app.appCodec.MustUnmarshalJSON(chainManagerGenesis, &chainManagerGenesisState)

	// Set the giltconsensus_chain_id in the chainManagerGenesisState to the root chain_id to avoid any mismatch
	chainManagerGenesisState.Params.ChainParams.GiltConsensusChainId = req.ChainId

	// Marshal the updated chainManagerGenesisState back into genesisState
	chainManagerGenesis = app.appCodec.MustMarshalJSON(&chainManagerGenesisState)
	genesisState[chainmanagertypes.ModuleName] = chainManagerGenesis

	// check fee collector module account
	if moduleAcc := app.AccountKeeper.GetModuleAccount(ctx, authtypes.FeeCollectorName); moduleAcc == nil {
		panic(fmt.Sprintf("%s module account has not been set", authtypes.FeeCollectorName))
	}

	// init genesis
	if _, err := app.ModuleManager.InitGenesis(ctx, app.AppCodec(), genesisState); err != nil {
		return &abci.ResponseInitChain{}, err
	}

	moduleAccTopUp := app.AccountKeeper.GetModuleAccount(ctx, topupTypes.ModuleName)
	if moduleAccTopUp == nil {
		panic(fmt.Sprintf("%s module account has not been set", topupTypes.ModuleName))
	}

	stakingState := staketypes.GetGenesisStateFromAppState(app.appCodec, genesisState)
	checkpointState := checkpointTypes.GetGenesisStateFromAppState(app.appCodec, genesisState)

	// check if validator is current validator
	// add to val updates else skip
	var valUpdates []abci.ValidatorUpdate

	for _, validator := range stakingState.Validators {
		if validator.IsCurrentValidator(checkpointState.AckCount) {
			cmtProtoPk, err := validator.CmtConsPublicKey()
			if err != nil {
				panic(err)
			}

			// convert to Validator Update
			updateVal := abci.ValidatorUpdate{
				Power:  validator.VotingPower,
				PubKey: cmtProtoPk,
			}
			// Add validator to validator updated to be processed below
			valUpdates = append(valUpdates, updateVal)
		}
	}

	// update validators
	return &abci.ResponseInitChain{
		Validators: valUpdates,
	}, nil
}

// BeginBlocker application updates every begin-block
func (app *GiltConsensusApp) BeginBlocker(ctx sdk.Context) (sdk.BeginBlock, error) {
	startTime := time.Now()
	defer metrics.RecordABCIHandlerDuration(metrics.BeginBlockerDuration, startTime)

	return app.ModuleManager.BeginBlock(ctx)
}

// EndBlocker application updates every end block
func (app *GiltConsensusApp) EndBlocker(ctx sdk.Context) (sdk.EndBlock, error) {
	startTime := time.Now()
	defer metrics.RecordABCIHandlerDuration(metrics.EndBlockerDuration, startTime)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	moduleAccount := app.AccountKeeper.GetModuleAccount(ctx, authtypes.FeeCollectorName)
	coin := app.BankKeeper.GetBalance(ctx, moduleAccount.GetAddress(), authtypes.FeeToken)
	if !coin.Amount.IsZero() {
		allocations, err := app.StakeKeeper.AllocateCurrentValidatorRewards(ctx, coin.Amount)
		if err != nil {
			return sdk.EndBlock{}, err
		}
		for _, allocation := range allocations {
			if allocation.Amount.IsZero() {
				continue
			}
			recipientBytes, err := address.NewHexCodec().StringToBytes(allocation.Signer)
			if err != nil {
				return sdk.EndBlock{}, err
			}
			coins := sdk.Coins{sdk.Coin{Denom: authtypes.FeeToken, Amount: allocation.Amount}}
			if err := app.BankKeeper.SendCoinsFromModuleToAccount(ctx, authtypes.FeeCollectorName, sdk.AccAddress(recipientBytes), coins); err != nil {
				app.Logger().Error("EndBlocker | SendCoinsFromModuleToAccount", "error", err)
			} else {
				sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
					hmTypes.EventTypeFeeTransfer,
					sdk.NewAttribute(hmTypes.AttributeKeyProposer, allocation.Signer),
					sdk.NewAttribute(hmTypes.AttributeKeyDenom, authtypes.FeeToken),
					sdk.NewAttribute(hmTypes.AttributeKeyAmount, allocation.Amount.String()),
				))
			}
		}
	}
	if _, ok := app.AccountKeeper.GetBlockProposer(ctx); ok {
		if err := app.AccountKeeper.RemoveBlockProposer(ctx); err != nil {
			app.Logger().Error("EndBlocker | RemoveBlockProposer", "error", err)
		}
	}

	customABCIEvents := sdkCtx.EventManager().ABCIEvents()
	result, err := app.ModuleManager.EndBlock(ctx)
	if err != nil {
		return result, err
	}
	result.Events = append(result.Events, customABCIEvents...)

	return result, nil
}

func (app *GiltConsensusApp) LoadHeight(height int64) error {
	return app.LoadVersion(height)
}

func (app *GiltConsensusApp) ModuleAccountAddrs() map[string]bool {
	modAccAddrs := make(map[string]bool)
	for acc := range maccPerms {
		modAccAddrs[authtypes.NewModuleAddress(acc).String()] = true
	}

	return modAccAddrs
}

func (app *GiltConsensusApp) LegacyAmino() *codec.LegacyAmino {
	return app.legacyAmino
}

func (app *GiltConsensusApp) AppCodec() codec.Codec {
	return app.appCodec
}

func (app *GiltConsensusApp) InterfaceRegistry() types.InterfaceRegistry {
	return app.interfaceRegistry
}

func (app *GiltConsensusApp) GetTxConfig() client.TxConfig {
	return app.txConfig
}

// AutoCliOpts returns the autocli options for the app.
func (app *GiltConsensusApp) AutoCliOpts() autocli.AppOptions {
	modules := make(map[string]appmodule.AppModule)
	for _, m := range app.ModuleManager.Modules {
		if moduleWithName, ok := m.(module.HasName); ok {
			moduleName := moduleWithName.Name()
			if appModule, ok := moduleWithName.(appmodule.AppModule); ok {
				modules[moduleName] = appModule
			}
		}
	}

	return autocli.AppOptions{
		Modules:               modules,
		ModuleOptions:         runtimeservices.ExtractAutoCLIOptions(app.ModuleManager.Modules),
		AddressCodec:          authcodec.NewHexCodec(),
		ValidatorAddressCodec: authcodec.NewHexCodec(),
		ConsensusAddressCodec: authcodec.NewHexCodec(),
	}
}

// DefaultGenesis returns a default genesis from the registered AppModuleBasic's.
func (app *GiltConsensusApp) DefaultGenesis() map[string]json.RawMessage {
	return app.BasicManager.DefaultGenesis(app.appCodec)
}

// GetKey returns the KVStoreKey for the provided store key.
//
// NOTE: This is solely to be used for testing purposes.
func (app *GiltConsensusApp) GetKey(storeKey string) *storetypes.KVStoreKey {
	return app.keys[storeKey]
}

// GetTKey returns the TransientStoreKey for the provided store key.
//
// NOTE: This is solely to be used for testing purposes.
func (app *GiltConsensusApp) GetTKey(storeKey string) *storetypes.TransientStoreKey {
	return app.tKeys[storeKey]
}

// GetStoreKeys returns all the stored store keys.
func (app *GiltConsensusApp) GetStoreKeys() []storetypes.StoreKey {
	keys := make([]storetypes.StoreKey, 0, len(app.keys))
	for _, key := range app.keys {
		keys = append(keys, key)
	}

	return keys
}

// SimulationManager implements the SimulationApp interface
func (app *GiltConsensusApp) SimulationManager() *module.SimulationManager {
	return app.simulationManager
}

func (app *GiltConsensusApp) RegisterAPIRoutes(apiSvr *api.Server, apiConfig config.APIConfig) {
	clientCtx := apiSvr.ClientCtx
	// Register new tx routes from grpc-gateway.
	authtx.RegisterGRPCGatewayRoutes(clientCtx, apiSvr.GRPCGatewayRouter)

	// Register new CometBFT queries routes from grpc-gateway.
	cmtservice.RegisterGRPCGatewayRoutes(clientCtx, apiSvr.GRPCGatewayRouter)

	// Register node gRPC service for grpc-gateway.
	nodeservice.RegisterGRPCGatewayRoutes(clientCtx, apiSvr.GRPCGatewayRouter)

	// Register grpc-gateway routes for all modules.
	app.BasicManager.RegisterGRPCGatewayRoutes(clientCtx, apiSvr.GRPCGatewayRouter)

	// register gilt-consensus and cosmos swagger API
	if err := RegisterSwaggerAPI(apiSvr.ClientCtx, apiSvr.Router, apiConfig.Swagger); err != nil {
		panic(err)
	}

	apiSvr.Router.HandleFunc("/status", getCometStatusHandler(clientCtx)).Methods("GET")

	apiSvr.Router.HandleFunc("/version", getGiltConsensusV2Version()).Methods("GET")
	apiSvr.Router.HandleFunc("/bridge/lifecycle", app.getBridgeLifecycleHandler()).Methods("GET")
	apiSvr.Router.HandleFunc("/bridge/lifecycle/{state_id}", app.getBridgeLifecycleByIDHandler()).Methods("GET")
	apiSvr.Router.HandleFunc("/bridge/chainid-stats", getBridgeChainIDStatsHandler()).Methods("GET")

	// Register the health service endpoint.
	apiSvr.Router.Handle("/health", app.customHealthServiceHandler(clientCtx)).Methods("GET")
}

func getCometStatusHandler(cliCtx client.Context) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		resultStatus, err := helper.GetNodeStatus(r.Context(), cliCtx)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to get node status: %v", err), http.StatusInternalServerError)
			return
		}
		resp, err := json.Marshal(resultStatus.SyncInfo)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to marshal node status: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set(headerContentType, mimeTypeApplicationJSON)
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(resp); err != nil {
			http.Error(w, fmt.Sprintf("failed to write response: %v", err), http.StatusInternalServerError)
			return
		}
	}
}

func getGiltConsensusV2Version() func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		versionInfo := hversion.NewInfo()
		versionBytes, err := json.Marshal(versionInfo)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to marshal version: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set(headerContentType, mimeTypeApplicationJSON)
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(versionBytes); err != nil {
			http.Error(w, fmt.Sprintf("failed to write version response: %v", err), http.StatusInternalServerError)
			return
		}
	}
}

func getBridgeChainIDStatsHandler() func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		invalidCount, lastInvalid := helper.ChainIDValidationStats()
		payload := map[string]interface{}{
			"rejection_count":        invalidCount,
			"last_rejection_reason":  lastInvalid,
			"invalid_chain_id_count": invalidCount,
			"last_invalid_chain_id":  lastInvalid,
		}

		w.Header().Set(headerContentType, mimeTypeApplicationJSON)
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			http.Error(w, fmt.Sprintf("failed to encode bridge chain-id stats: %v", err), http.StatusInternalServerError)
		}
	}
}

func (app *GiltConsensusApp) lifecycleQueryContext() context.Context {
	header := cmtproto.Header{
		Height: app.LastBlockHeight(),
		Time:   time.Now().UTC(),
	}
	return sdk.WrapSDKContext(app.NewUncachedContext(true, header))
}

func (app *GiltConsensusApp) getBridgeLifecycleByIDHandler() func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		stateIDRaw := mux.Vars(r)["state_id"]
		stateID, err := strconv.ParseUint(strings.TrimSpace(stateIDRaw), 10, 64)
		if err != nil || stateID == 0 {
			http.Error(w, "invalid state_id", http.StatusBadRequest)
			return
		}

		record, err := app.ClerkKeeper.GetBridgeLifecycleByID(app.lifecycleQueryContext(), stateID)
		if err != nil {
			if errors.Is(err, collections.ErrNotFound) {
				http.Error(w, "bridge lifecycle record not found", http.StatusNotFound)
				return
			}
			http.Error(w, fmt.Sprintf("failed to query bridge lifecycle record: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set(headerContentType, mimeTypeApplicationJSON)
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(record); err != nil {
			http.Error(w, fmt.Sprintf("failed to encode bridge lifecycle record: %v", err), http.StatusInternalServerError)
			return
		}
	}
}

func (app *GiltConsensusApp) getBridgeLifecycleHandler() func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		fromStateID := uint64(1)
		limit := uint64(100)

		if fromRaw := strings.TrimSpace(r.URL.Query().Get("from_state_id")); fromRaw != "" {
			parsed, err := strconv.ParseUint(fromRaw, 10, 64)
			if err != nil || parsed == 0 {
				http.Error(w, "invalid from_state_id", http.StatusBadRequest)
				return
			}
			fromStateID = parsed
		}

		if limitRaw := strings.TrimSpace(r.URL.Query().Get("limit")); limitRaw != "" {
			parsed, err := strconv.ParseUint(limitRaw, 10, 64)
			if err != nil || parsed == 0 {
				http.Error(w, "invalid limit", http.StatusBadRequest)
				return
			}
			if parsed > 500 {
				parsed = 500
			}
			limit = parsed
		}

		records, err := app.ClerkKeeper.ListBridgeLifecycleByStateID(app.lifecycleQueryContext(), fromStateID, limit)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to query bridge lifecycle records: %v", err), http.StatusInternalServerError)
			return
		}

		aggregates := map[string]uint64{
			clerktypes.BridgeLifecycleSeen:            0,
			clerktypes.BridgeLifecyclePending:         0,
			clerktypes.BridgeLifecycleConfirmed:       0,
			clerktypes.BridgeLifecycleFinalizedAction: 0,
			clerktypes.BridgeLifecycleSubmitted:       0,
			clerktypes.BridgeLifecycleCompleted:       0,
			clerktypes.BridgeLifecycleFailedRetryable: 0,
			clerktypes.BridgeLifecycleFailedTerminal:  0,
		}
		for _, record := range records {
			aggregates[record.LifecycleState]++
		}

		payload := map[string]interface{}{
			"from_state_id": fromStateID,
			"limit":         limit,
			"records":       records,
			"aggregates":    aggregates,
		}

		w.Header().Set(headerContentType, mimeTypeApplicationJSON)
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			http.Error(w, fmt.Sprintf("failed to encode bridge lifecycle list: %v", err), http.StatusInternalServerError)
		}
	}
}

func (app *GiltConsensusApp) RegisterTxService(clientCtx client.Context) {
	authtx.RegisterTxService(app.BaseApp.GRPCQueryRouter(), clientCtx, app.BaseApp.Simulate, app.interfaceRegistry)
}

// RegisterTendermintService implements the Application.RegisterTendermintService method.
func (app *GiltConsensusApp) RegisterTendermintService(clientCtx client.Context) {
	cmtApp := server.NewCometABCIWrapper(app)
	cmtservice.RegisterTendermintService(
		clientCtx,
		app.BaseApp.GRPCQueryRouter(),
		app.interfaceRegistry,
		cmtApp.Query,
	)
}

func (app *GiltConsensusApp) RegisterNodeService(clientCtx client.Context, cfg config.Config) {
	nodeservice.RegisterNodeService(clientCtx, app.GRPCQueryRouter(), cfg)
}

func (app *GiltConsensusApp) OnTxSucceeded(_ sdk.Context, _, _ string, _ []byte, _ []byte) {
}

func (app *GiltConsensusApp) OnTxFailed(_ sdk.Context, _, _ string, _ []byte, _ []byte) {
}

func (app *GiltConsensusApp) GetBaseApp() *baseapp.BaseApp {
	return app.BaseApp
}

func (app *GiltConsensusApp) RegisterSideMsgServices(cfg sidetxs.SideTxConfigurator) {
	for _, md := range app.ModuleManager.Modules {
		if sideMsgModule, ok := md.(sidetxs.HasSideMsgServices); ok {
			sideMsgModule.RegisterSideMsgServices(cfg)
		}
	}
}

type EmptyAppOptions struct{}

func (ao EmptyAppOptions) Get(_ string) interface{} {
	return nil
}

// GetSubspace returns a param subspace for a given module name.
//
// NOTE: This is solely to be used for testing purposes.
func (app *GiltConsensusApp) GetSubspace(moduleName string) paramstypes.Subspace {
	subspace, _ := app.ParamsKeeper.GetSubspace(moduleName)
	return subspace
}

func (app *GiltConsensusApp) GetMemKey(storeKey string) *storetypes.MemoryStoreKey {
	return app.memKeys[storeKey]
}

// cacheTxContext returns a new context based off of the provided context with
// a cache wrapped multi-store.
func (app *GiltConsensusApp) cacheTxContext(ctx sdk.Context) (sdk.Context, storetypes.CacheMultiStore) {
	ms := ctx.MultiStore()
	msCache := ms.CacheMultiStore()

	return ctx.WithMultiStore(msCache), msCache
}

// GetMaccPerms returns a copy of the module account permissions
func GetMaccPerms() map[string][]string {
	dupMaccPerms := make(map[string][]string)
	for k, v := range maccPerms {
		dupMaccPerms[k] = v
	}

	return dupMaccPerms
}

func (app *GiltConsensusApp) BlockedModuleAccountAddrs(modAccAddrs map[string]bool) map[string]bool {
	delete(modAccAddrs, authtypes.NewModuleAddress(govtypes.ModuleName).String())
	delete(modAccAddrs, authtypes.NewModuleAddress(topupTypes.ModuleName).String())
	return modAccAddrs
}

// initParamsKeeper init params keeper and its subspaces
func initParamsKeeper(appCodec codec.BinaryCodec, legacyAmino *codec.LegacyAmino, key, storeKey storetypes.StoreKey) paramskeeper.Keeper {
	paramsKeeper := paramskeeper.NewKeeper(appCodec, legacyAmino, key, storeKey)

	paramsKeeper.Subspace(authtypes.ModuleName)
	paramsKeeper.Subspace(banktypes.ModuleName)
	paramsKeeper.Subspace(govtypes.ModuleName)
	paramsKeeper.Subspace(chainmanagertypes.ModuleName)
	paramsKeeper.Subspace(checkpointTypes.ModuleName)
	paramsKeeper.Subspace(clerktypes.ModuleName)
	paramsKeeper.Subspace(staketypes.ModuleName)
	paramsKeeper.Subspace(topupTypes.ModuleName)

	return paramsKeeper
}

func RegisterSwaggerAPI(ctx client.Context, rtr *mux.Router, swaggerEnabled bool) interface{} {
	if !swaggerEnabled {
		return nil
	}

	root, err := fs.Sub(docs.SwaggerUI, "swagger-ui")
	if err != nil {
		return err
	}

	staticServer := http.FileServer(http.FS(root))
	rtr.PathPrefix("/gilt-consensus/swagger/").Handler(http.StripPrefix("/gilt-consensus/swagger/", staticServer))

	// register cosmos-sdk swagger API from root so that other applications can override easily
	if err := server.RegisterSwaggerAPI(ctx, rtr, swaggerEnabled); err != nil {
		panic(err)
	}

	return nil
}

// customHealthServiceHandler wraps the health-go handler and adds GiltConsensus-specific information on top of it.
func (app *GiltConsensusApp) customHealthServiceHandler(clientCtx client.Context) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := &ResponseRecorder{
			ResponseWriter: w,
			body:           make([]byte, 0),
		}

		app.healthService.Handler().ServeHTTP(recorder, r)

		var healthResponse map[string]any
		if err := json.Unmarshal(recorder.body, &healthResponse); err != nil {
			app.Logger().Error("Failed to unmarshal response: %v\n", err)
			w.Header().Set(headerContentType, mimeTypeApplicationJSON)
			w.WriteHeader(recorder.statusCode)
			if _, writeErr := w.Write(recorder.body); writeErr != nil {
				app.Logger().Error("Failed to write fallback response: %v\n", writeErr)
			}
			return
		}

		// Remove the "status" field from health-go as it's always "OK" and not useful.
		delete(healthResponse, "status")

		giltconsensusInfo, err := app.getGiltConsensusInfo(r.Context(), clientCtx)
		if err != nil {
			healthResponse["error"] = true
			healthResponse["error_message"] = err.Error()
		} else {
			healthResponse["error"] = false
			healthResponse["error_message"] = ""
		}
		healthResponse["node_info"] = giltconsensusInfo

		status := app.performHealthChecks(healthResponse)
		healthResponse["status"] = status

		w.Header().Set(headerContentType, mimeTypeApplicationJSON)
		w.WriteHeader(recorder.statusCode)

		if err := json.NewEncoder(w).Encode(healthResponse); err != nil {
			app.Logger().Error("Failed to encode response: %v\n", err)
			if _, writeErr := w.Write(recorder.body); writeErr != nil {
				app.Logger().Error("Failed to write fallback response: %v\n", writeErr)
			}
		}
	})
}

// performHealthChecks performs threshold-based health checks and returns the overall status.
func (app *GiltConsensusApp) performHealthChecks(healthResponse map[string]any) HealthStatus {
	overallStatus := StatusOK
	var statusMessages []string

	cfg := helper.GetConfig()

	// Goroutines check.
	if system, ok := healthResponse["system"].(map[string]any); ok && system != nil {
		if goroutinesCount, ok := system["goroutines_count"].(float64); ok {
			// Check the critical threshold first.
			if cfg.MaxGoRoutineThreshold != 0 && int(goroutinesCount) > cfg.MaxGoRoutineThreshold {
				overallStatus = StatusCritical
				statusMessages = append(statusMessages, "number of goroutines above the maximum threshold")
			} else if cfg.WarnGoRoutineThreshold != 0 && int(goroutinesCount) > cfg.WarnGoRoutineThreshold {
				// Only set to warn if we haven't already hit critical.
				overallStatus = StatusWarn
				statusMessages = append(statusMessages, "number of goroutines above the warning threshold")
			}
		}
	}

	// Peer check - only perform if node_info exists and has peer_count.
	if giltconsensusInfo, ok := healthResponse["node_info"].(map[string]any); ok && giltconsensusInfo != nil {
		if peerCount, ok := giltconsensusInfo["peer_count"].(int); ok {
			// Check the critical threshold first.
			if cfg.MinPeerThreshold != 0 && peerCount < cfg.MinPeerThreshold {
				overallStatus = StatusCritical
				statusMessages = append(statusMessages, "number of peers below the minimum threshold")
			} else if cfg.WarnPeerThreshold != 0 && peerCount < cfg.WarnPeerThreshold {
				// Only set to warn if we haven't already hit critical.
				if overallStatus != StatusCritical {
					overallStatus = StatusWarn
				}
				statusMessages = append(statusMessages, "number of peers below the warning threshold")
			}
		}
	}

	return HealthStatus{
		Level:   overallStatus,
		Code:    overallStatus.Code(),
		Message: strings.Join(statusMessages, ", "),
	}
}

func (app *GiltConsensusApp) getGiltConsensusInfo(ctx context.Context, clientCtx client.Context) (map[string]any, error) {
	giltconsensusInfo := map[string]any{}

	giltconsensusStatus, err := helper.GetNodeStatus(ctx, clientCtx)
	if err != nil {
		err = fmt.Errorf("failed to get node status: %w", err)
		return giltconsensusInfo, err
	}

	comeBFTRPCUrl := helper.GetConfig().CometBFTRPCUrl
	comeBFTRPC, err := client.NewClientFromNode(comeBFTRPCUrl)
	if err != nil {
		err = fmt.Errorf("failed to get cometbft client: %w", err)
		return giltconsensusInfo, err
	}

	// Create a context with timeout for the RPC call
	ctxWithTimeout, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()

	netInfo, err := comeBFTRPC.NetInfo(ctxWithTimeout)
	if err != nil {
		err = fmt.Errorf("failed to get cometBft net info: %w", err)
		return giltconsensusInfo, err
	}

	giltconsensusInfo["chain_id"] = giltconsensusStatus.NodeInfo.Network

	giltconsensusInfo["catching_up"] = giltconsensusStatus.SyncInfo.CatchingUp

	giltconsensusInfo["latest_block_hash"] = giltconsensusStatus.SyncInfo.LatestBlockHash.String()
	giltconsensusInfo["latest_block_number"] = giltconsensusStatus.SyncInfo.LatestBlockHeight
	giltconsensusInfo["latest_block_timestamp"] = giltconsensusStatus.SyncInfo.LatestBlockTime.Format(time.RFC3339Nano)

	giltconsensusInfo["peer_count"] = netInfo.NPeers

	giltconsensusInfo["validator_address"] = giltconsensusStatus.ValidatorInfo.Address.String()
	giltconsensusInfo["validator_voting_power"] = giltconsensusStatus.ValidatorInfo.VotingPower

	return giltconsensusInfo, nil
}
