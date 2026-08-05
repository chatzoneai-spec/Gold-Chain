package helper

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	logger "cosmossdk.io/log"
	cfg "github.com/cometbft/cometbft/config"
	"github.com/cometbft/cometbft/crypto/secp256k1"
	"github.com/cometbft/cometbft/privval"
	"github.com/cosmos/cosmos-sdk/client/flags"
	addressCodec "github.com/cosmos/cosmos-sdk/codec/address"
	serverconfig "github.com/cosmos/cosmos-sdk/server/config"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
	"github.com/rs/zerolog"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/giltchain/gilt-consensus/file"
)

const (
	CometBFTNodeFlag            = "node"
	WithGiltConsensusConfigFlag = "app"
	RestServerFlag              = "rest-server"
	BridgeFlag                  = "bridge"
	AllProcessesFlag            = "all"
	OnlyProcessesFlag           = "only"
	LogsWriterFileFlag          = "logs_writer_file"
	SeedsFlag                   = "seeds"

	MainChain = "mainnet"
	// TestnetChain is the canonical public testnet label for Gilt consensus.
	TestnetChain = "gilttestnet"
	// GiltTestnetChain is kept as an internal alias to avoid broad refactors.
	GiltTestnetChain = TestnetChain
	// legacyGiltTestnetLegacyChain is accepted only as a backwards-compatible input alias.
	legacyGiltTestnetLegacyChain = "gilttestnet-gilttestnet-legacy-legacy"

	// app config flags

	MainRPCUrlFlag   = "eth_rpc_url"
	GiltRPCUrlFlag   = "gilt_rpc_url"
	GiltGRPCUrlFlag  = "gilt_grpc_url"
	GiltGRPCFlagFlag = "gilt_grpc_flag"

	CometBFTNodeURLFlag          = "comet_bft_rpc_url"
	GiltConsensusServerURLFlag   = "giltconsensus_rest_server"
	GRPCServerURLFlag            = "grpc_server"
	AmqpURLFlag                  = "amqp_url"
	CheckpointerPollIntervalFlag = "checkpoint_poll_interval"
	SyncerPollIntervalFlag       = "syncer_poll_interval"
	NoACKPollIntervalFlag        = "noack_poll_interval"
	ClerkPollIntervalFlag        = "clerk_poll_interval"
	SpanPollIntervalFlag         = "span_poll_interval"
	MilestonePollIntervalFlag    = "milestone_poll_interval"

	MainChainGasFeeCapFlag = "main_chain_gas_fee_cap"
	MainChainGasTipCapFlag = "main_chain_gas_tip_cap"

	NoACKWaitTimeFlag = "no_ack_wait_time"
	ChainFlag         = "chain"
	ProducerVotesFlag = "producer_votes"

	DefaultMainRPCUrl   = "http://localhost:9545"
	DefaultGiltRPCUrl   = "http://localhost:8545"
	DefaultGiltGRPCUrl  = "localhost:3131"
	DefaultGiltGRPCFlag = false

	DefaultEthRPCTimeout  = 5 * time.Second
	DefaultGiltRPCTimeout = 1 * time.Second

	// DefaultAmqpURL represents default AMQP url
	DefaultAmqpURL = "amqp://guest:guest@localhost:5672/"

	DefaultGiltConsensusServerURL = "tcp://0.0.0.0:1317"

	DefaultCometBFTNodeURL = "http://0.0.0.0:26657"

	NoACKWaitTime = 1800 * time.Second // Time ack service waits to clear the buffer and elect the new proposer (1800 seconds ~ 30 min)

	DefaultCheckpointPollInterval = 5 * time.Minute
	DefaultSyncerPollInterval     = 1 * time.Minute
	DefaultNoACKPollInterval      = 1010 * time.Second
	DefaultClerkPollInterval      = 10 * time.Second
	DefaultSpanPollInterval       = 1 * time.Minute

	DefaultMilestonePollInterval = 30 * time.Second

	// Self-healing defaults

	DefaultEnableSH                = false
	DefaultSHStateSyncedInterval   = 3 * time.Hour
	DefaultSHCheckpointAckInterval = 30 * time.Minute
	DefaultSHMaxDepthDuration      = 24 * time.Hour

	DefaultMainChainGasFeeCap = 500000000000 // 500 Gwei
	DefaultMainChainGasTipCap = 10000000000  // 10 Gwei

	DefaultGiltChainID          = "15001"
	DefaultGiltConsensusChainID = "giltconsensus-15001"

	DefaultLogsType = "json"
	DefaultChain    = MainChain

	DefaultMainnetSeeds            = "e019e16d4e376723f3adc58eb1761809fea9bee0@35.234.150.253:26656,7f3049e88ac7f820fd86d9120506aaec0dc54b27@34.89.75.187:26656,1f5aff3b4f3193404423c3dd1797ce60cd9fea43@34.142.43.249:26656,2d5484feef4257e56ece025633a6ea132d8cadca@35.246.99.203:26656,17e9efcbd173e81a31579310c502e8cdd8b8ff2e@35.197.233.240:26656,72a83490309f9f63fdca3a0bef16c290e5cbb09c@35.246.95.65:26656,00677b1b2c6282fb060b7bb6e9cc7d2d05cdd599@34.105.180.11:26656,721dd4cebfc4b78760c7ee5d7b1b44d29a0aa854@34.147.169.102:26656,4760b3fc04648522a0bcb2d96a10aadee141ee89@34.89.55.74:26656"
	DefaultGiltTestnetTestnetSeeds = "e4eabef3111155890156221f018b0ea3b8b64820@35.197.249.21:26656,811c3127677a4a34df907b021aad0c9d22f84bf4@34.89.39.114:26656,2ec15d1d33261e8cf42f57236fa93cfdc21c1cfb@35.242.167.175:26656,38120f9d2c003071a7230788da1e3129b6fb9d3f@34.89.15.223:26656,2f16f3857c6c99cc11e493c2082b744b8f36b127@34.105.128.110:26656,2833f06a5e33da2e80541fb1bfde2a7229877fcb@34.89.21.99:26656,2e6f1342416c5d758f5ae32f388bb76f7712a317@34.89.101.16:26656,a596f98b41851993c24de00a28b767c7c5ff8b42@34.89.11.233:26656"

	DefaultMainnetProducers = "91,92,93,94"

	DefaultGiltTestnetTestnetProducers = "4,5"

	DefaultLocalTestnetProducers = "1,2,3,4"

	secretFilePerm = 0o600

	// MaxStateSyncSize is the new max state sync size after SpanOverrideHeight hard fork
	MaxStateSyncSize = 30000

	EnforcedMinRetainBlocks = 2500000

	privValJsonFile = "priv_validator_key.json"

	bindPFlagLog = "%v | BindPFlag | %v"
)

func init() {
	Logger = logger.NewLogger(os.Stdout, logger.LevelOption(zerolog.InfoLevel))
}

// CustomConfig represents giltconsensus config
type CustomConfig struct {
	EthRPCUrl      string `mapstructure:"eth_rpc_url"`       // RPC endpoint for main chain
	GiltRPCUrl     string `mapstructure:"gilt_rpc_url"`      // RPC endpoint for gilt chain
	GiltGRPCFlag   bool   `mapstructure:"gilt_grpc_flag"`    // gRPC flag for gilt chain
	GiltGRPCUrl    string `mapstructure:"gilt_grpc_url"`     // gRPC endpoint for gilt chain
	CometBFTRPCUrl string `mapstructure:"comet_bft_rpc_url"` // cometBft node url
	SubGraphUrl    string `mapstructure:"sub_graph_url"`     // sub graph url

	EthRPCTimeout  time.Duration `mapstructure:"eth_rpc_timeout"`  // timeout for eth rpc
	GiltRPCTimeout time.Duration `mapstructure:"gilt_rpc_timeout"` // timeout for gilt rpc

	AmqpURL string `mapstructure:"amqp_url"` // amqp url

	MainChainGasFeeCap int64 `mapstructure:"main_chain_gas_fee_cap"` // max fee per gas for EIP-1559 txs (in wei)
	MainChainGasTipCap int64 `mapstructure:"main_chain_gas_tip_cap"` // max priority fee per gas for EIP-1559 txs (in wei)

	// config related to bridge
	CheckpointPollInterval  time.Duration `mapstructure:"checkpoint_poll_interval"` // Poll interval for checkpointer service to send new checkpoints or missing ACK
	SyncerPollInterval      time.Duration `mapstructure:"syncer_poll_interval"`     // Poll interval for syncer service to sync for changes on the main chain
	NoACKPollInterval       time.Duration `mapstructure:"noack_poll_interval"`      // Poll interval for ack service to send no-ack in case of no checkpoints
	ClerkPollInterval       time.Duration `mapstructure:"clerk_poll_interval"`
	SpanPollInterval        time.Duration `mapstructure:"span_poll_interval"`
	MilestonePollInterval   time.Duration `mapstructure:"milestone_poll_interval"`
	EnableSH                bool          `mapstructure:"enable_self_heal"`           // Enable self-healing
	SHStateSyncedInterval   time.Duration `mapstructure:"sh_state_synced_interval"`   // Interval to self-heal StateSynced events if missing
	SHCheckpointAckInterval time.Duration `mapstructure:"sh_checkpoint_ack_interval"` // Interval to self-heal Checkpoint ACKs (New Header Blocks) events if missing
	SHMaxDepthDuration      time.Duration `mapstructure:"sh_max_depth_duration"`      // Max duration that allows to suggest self-healing is not needed

	// wait-time-related options
	NoACKWaitTime time.Duration `mapstructure:"no_ack_wait_time"` // Time ack service waits to clear the buffer and elect the new proposer

	// Log related options
	LogsType       string `mapstructure:"logs_type"`        // if true, enable logging in json format
	LogsWriterFile string `mapstructure:"logs_writer_file"` // if given, Logs will be written to this file else os.Stdout

	Chain string `mapstructure:"chain"`

	ProducerVotes string `mapstructure:"producer_votes"`

	// #### Health check configs ####
	// MaxGoRoutineThreshold is the maximum number of goroutines before giltconsensus health check fails.
	MaxGoRoutineThreshold int `mapstructure:"max_goroutine_threshold"`

	// WarnGoRoutineThreshold is the maximum number of goroutines before giltconsensus health check warns.
	WarnGoRoutineThreshold int `mapstructure:"warn_goroutine_threshold"`

	// MinPeerThreshold is the minimum number of peers before giltconsensus health check fails.
	MinPeerThreshold int `mapstructure:"min_peer_threshold"`

	// WarnPeerThreshold is the minimum number of peers before giltconsensus health check warns.
	WarnPeerThreshold int `mapstructure:"warn_peer_threshold"`
}

type CustomAppConfig struct {
	serverconfig.Config `mapstructure:",squash"`
	Custom              CustomConfig `mapstructure:"custom"`
}

var conf CustomAppConfig

// MainChainClient stores eth client for mainChain
var (
	mainChainClient *ethclient.Client
	mainRPCClient   *rpc.Client
)

// giltClient stores eth/rpc client for gilt
var (
	giltClient    *ethclient.Client
	giltRPCClient *rpc.Client
)

// private key object
var privKeyObject secp256k1.PrivKey

var pubKeyObject secp256k1.PubKey

var producerVotes []uint64

// Logger stores global logger object
var Logger logger.Logger

var rioHeight int64 = 0

var tallyFixHeight int64 = 0

var disableVPCheckHeight int64 = 0

var disableValSetCheckHeight int64 = 0

var initialHeight int64 = 0

var milestoneDeletionHeight int64 = 0

var faultyMilestoneNumber int64 = 0

var producerDowntimeHeight int64 = 0

type ChainManagerAddressMigration struct {
	RootChainAddress      string
	SlashManagerAddress   string
	StakingInfoAddress    string
	StateSenderAddress    string
}

var chainManagerAddressMigrations = map[string]map[int64]ChainManagerAddressMigration{
	MainChain:    {},
	TestnetChain: {},
	"default":    {},
}

// parseProducerVotes parses a comma-separated string of producer IDs into a slice of uint64
func parseProducerVotes(producerVotesStr string) []uint64 {
	if producerVotesStr == "" {
		return []uint64{}
	}

	producerStrings := strings.Split(producerVotesStr, ",")
	if len(producerStrings) > 0 && producerStrings[0] != "" {
		votes := make([]uint64, len(producerStrings))
		for i, p := range producerStrings {
			pTrimmed := strings.TrimSpace(p)
			if pTrimmed == "" {
				log.Fatalf("Empty producer ID found in producer votes list: '%s'", producerVotesStr)
			}
			var parseErr error
			votes[i], parseErr = strconv.ParseUint(pTrimmed, 10, 64)
			if parseErr != nil {
				log.Fatalf("Failed to parse producer ID '%s': %v", pTrimmed, parseErr)
			}
		}
		return votes
	}

	return []uint64{}
}

func normalizeChainName(chain string) string {
	if chain == legacyGiltTestnetLegacyChain {
		return TestnetChain
	}

	return chain
}

// InitGiltConsensusConfig initializes with viper config (from giltconsensus configuration)
func InitGiltConsensusConfig(homeDir string) {
	if strings.Compare(homeDir, "") == 0 {
		// get home dir from viper
		homeDir = viper.GetString(flags.FlagHome)
	}

	// get giltconsensus config filepath from the viper/cobra flag
	giltconsensusConfigFileFromFlag := viper.GetString(WithGiltConsensusConfigFlag)

	// init giltconsensus with changed config files
	InitGiltConsensusConfigWith(homeDir, giltconsensusConfigFileFromFlag)
}

// InitGiltConsensusConfigWith initializes passed giltconsensus/tendermint config files
func InitGiltConsensusConfigWith(homeDir string, giltconsensusConfigFileFromFlag string) {
	var err error

	if strings.Compare(homeDir, "") == 0 {
		panic("home directory is not specified")
	}

	if strings.Compare(conf.Custom.GiltRPCUrl, "") != 0 || strings.Compare(conf.Custom.GiltGRPCUrl, "") != 0 {
		return
	}

	// read configuration from the standard configuration file
	configDir := filepath.Join(homeDir, "config")
	giltconsensusViper := viper.New()
	giltconsensusViper.SetEnvPrefix("GILTCONSENSUS")
	giltconsensusViper.AutomaticEnv()

	if giltconsensusConfigFileFromFlag == "" {
		giltconsensusViper.SetConfigName("app")     // name of the config file (without extension)
		giltconsensusViper.AddConfigPath(configDir) // call multiple times to add many search paths
	} else {
		giltconsensusViper.SetConfigFile(giltconsensusConfigFileFromFlag) // set the config file explicitly
	}

	// Handle errors reading the config file
	if err = giltconsensusViper.ReadInConfig(); err != nil {
		log.Fatal(err)
	}

	// unmarshal configuration from the standard configuration file
	if err = giltconsensusViper.UnmarshalExact(&conf); err != nil {
		log.Fatalln("unable to unmarshall config", "Error", err)
	}

	//  if there is a file with overrides submitted via flags => read it and merge it with the already read standard configuration
	if giltconsensusConfigFileFromFlag != "" {
		giltconsensusViperFromFlag := viper.New()
		giltconsensusViperFromFlag.SetConfigFile(giltconsensusConfigFileFromFlag) // set the flag config file explicitly

		err = giltconsensusViperFromFlag.ReadInConfig()
		if err != nil { // Handle errors reading the config file submitted as a flag
			log.Fatalln("unable to read config file submitted via flag", "Error", err)
		}

		var confFromFlag CustomConfig
		// unmarshal configuration from the configuration file submitted as a flag
		if err = giltconsensusViperFromFlag.UnmarshalExact(&confFromFlag); err != nil {
			log.Fatalln("unable to unmarshall config file submitted via flag", "Error", err)
		}

		conf.Merge(&confFromFlag)
	}

	// update configuration data with submitted flags
	if err = conf.UpdateWithFlags(viper.GetViper(), Logger); err != nil {
		log.Fatalln("unable to read flag values. Check log for details.", "Error", err)
	}

	if conf.Custom.Chain == legacyGiltTestnetLegacyChain {
		Logger.Info("legacy testnet alias detected; using canonical chain", "from", legacyGiltTestnetLegacyChain, "to", TestnetChain)
	}
	conf.Custom.Chain = normalizeChainName(conf.Custom.Chain)

	logLevelStr := viper.GetString(flags.FlagLogLevel)
	logLevel, err := zerolog.ParseLevel(logLevelStr)
	if err != nil {
		logLevel = zerolog.InfoLevel
	}

	logNoColor := viper.GetBool(flags.FlagLogNoColor)
	var logOpts []logger.Option
	if conf.Custom.LogsType == "json" {
		logOpts = append(logOpts, logger.OutputJSONOption())
	} else {
		logOpts = append(logOpts, logger.ColorOption(!logNoColor))
	}
	logOpts = append(logOpts,
		logger.LevelOption(logLevel),
		logger.TimeFormatOption(time.RFC3339Nano),
	)

	Logger = logger.NewLogger(GetLogsWriter(conf.Custom.LogsWriterFile), logOpts...)

	// perform checks for timeout
	if conf.Custom.EthRPCTimeout == 0 {
		// fallback to default
		Logger.Debug("Missing ETH RPC timeout or invalid value provided, falling back to default", "timeout", DefaultEthRPCTimeout)
		conf.Custom.EthRPCTimeout = DefaultEthRPCTimeout
	}

	if conf.Custom.GiltRPCTimeout == 0 {
		// fallback to default
		Logger.Debug("Missing GILT RPC timeout or invalid value provided, falling back to default", "timeout", DefaultGiltRPCTimeout)
		conf.Custom.GiltRPCTimeout = DefaultGiltRPCTimeout
	}

	if conf.Custom.SHStateSyncedInterval == 0 {
		// fallback to default
		Logger.Debug("Missing self-healing StateSynced interval or invalid value provided, falling back to default", "interval", DefaultSHStateSyncedInterval)
		conf.Custom.SHStateSyncedInterval = DefaultSHStateSyncedInterval
	}

	if conf.Custom.SHCheckpointAckInterval == 0 {
		// fallback to default
		Logger.Debug("Missing self-healing Checkpoint ACK interval or invalid value provided, falling back to default", "interval", DefaultSHCheckpointAckInterval)
		conf.Custom.SHCheckpointAckInterval = DefaultSHCheckpointAckInterval
	}

	if conf.Custom.SHMaxDepthDuration == 0 {
		// fallback to default
		Logger.Debug("Missing self-healing max depth duration or invalid value provided, falling back to default", "duration", DefaultSHMaxDepthDuration)
		conf.Custom.SHMaxDepthDuration = DefaultSHMaxDepthDuration
	}

	// validate EIP-1559 gas config: tip cap must not exceed fee cap
	if conf.Custom.MainChainGasTipCap > conf.Custom.MainChainGasFeeCap {
		log.Fatal("invalid gas config: main_chain_gas_tip_cap must not exceed main_chain_gas_fee_cap",
			"tip_cap", conf.Custom.MainChainGasTipCap,
			"fee_cap", conf.Custom.MainChainGasFeeCap,
		)
	}

	if mainRPCClient, err = rpc.Dial(conf.Custom.EthRPCUrl); err != nil {
		log.Fatal("unable to dial main chain RPC client", "URL", conf.Custom.EthRPCUrl, "error", err)
	}

	mainChainClient = ethclient.NewClient(mainRPCClient)

	if giltRPCClient, err = rpc.Dial(conf.Custom.GiltRPCUrl); err != nil {
		log.Fatal("unable to dial gilt chain RPC client", "URL", conf.Custom.GiltRPCUrl, "error", err)
	}

	giltClient = ethclient.NewClient(giltRPCClient)
	warnIfGiltRPCInaccessible(giltClient, conf.Custom.GiltRPCTimeout, conf.Custom.GiltRPCUrl)

	// Set default producers based on the chain if not already set by config or flags
	if conf.Custom.ProducerVotes == "" {
		switch conf.Custom.Chain {
		case MainChain:
			conf.Custom.ProducerVotes = DefaultMainnetProducers
			Logger.Debug("Using default mainnet producers", "producers", DefaultMainnetProducers)
		case TestnetChain:
			conf.Custom.ProducerVotes = DefaultGiltTestnetTestnetProducers
			Logger.Debug("Using default gilttestnet producers", "producers", DefaultGiltTestnetTestnetProducers)
		default:
			conf.Custom.ProducerVotes = DefaultLocalTestnetProducers
			Logger.Debug("Using default local producers", "producers", DefaultLocalTestnetProducers)
		}
	}

	producerVotes = parseProducerVotes(conf.Custom.ProducerVotes)
	if len(producerVotes) == 0 {
		Logger.Info("No producer votes configured or parsed.")
	}

	// load pv file, unmarshall and set to privKeyObject
	err = file.PermCheck(file.Rootify(privValJsonFile, configDir), secretFilePerm)
	if err != nil {
		Logger.Error(err.Error())
	}

	privVal := privval.LoadFilePV(filepath.Join(configDir, privValJsonFile), filepath.Join(configDir, privValJsonFile))
	privKeyObject = privVal.Key.PrivKey.Bytes()
	pubKeyObject = privVal.Key.PubKey.Bytes()

	switch conf.Custom.Chain {
	case MainChain:
		milestoneDeletionHeight = 28525000
		faultyMilestoneNumber = 1941439
		rioHeight = 77414656 // Rio height for Mainnet.
		tallyFixHeight = 28913694
		disableVPCheckHeight = 25723000
		disableValSetCheckHeight = 25723063
		initialHeight = 24404501
		producerDowntimeHeight = 34966593
	case TestnetChain:
		milestoneDeletionHeight = 0
		faultyMilestoneNumber = -1
		rioHeight = 26272256 // Rio height for GiltTestnet testnet.
		tallyFixHeight = 13143851
		disableVPCheckHeight = 10618199
		disableValSetCheckHeight = 10618299
		initialHeight = 8788501
		producerDowntimeHeight = 20457139
	default:
		milestoneDeletionHeight = 0
		faultyMilestoneNumber = -1
		rioHeight = 128 // Rio height for local devnet.
		tallyFixHeight = 0
		disableVPCheckHeight = 0
		disableValSetCheckHeight = 0
		initialHeight = 0
		producerDowntimeHeight = 0
	}
}

// warnIfGiltRPCInaccessible checks if the Gilt RPC endpoint is accessible by making a simple call to get the latest block number.
// If the call fails, it logs a warning message. This is useful to detect issues with the Gilt RPC endpoint at startup.
func warnIfGiltRPCInaccessible(client *ethclient.Client, timeout time.Duration, url string) {
	if client == nil {
		Logger.Warn("Gilt RPC client is nil", "URL", url)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	if _, err := client.BlockNumber(ctx); err != nil {
		Logger.Warn("Gilt RPC endpoint appears inaccessible at startup", "URL", url, "error", err)
	}
}

// GetDefaultGiltConsensusConfig returns configuration with default params
func GetDefaultGiltConsensusConfig() CustomConfig {
	return CustomConfig{
		EthRPCUrl:    DefaultMainRPCUrl,
		GiltRPCUrl:   DefaultGiltRPCUrl,
		GiltGRPCFlag: DefaultGiltGRPCFlag,
		GiltGRPCUrl:  DefaultGiltGRPCUrl,

		ProducerVotes: DefaultMainnetProducers,

		CometBFTRPCUrl: DefaultCometBFTNodeURL,

		EthRPCTimeout:  DefaultEthRPCTimeout,
		GiltRPCTimeout: DefaultGiltRPCTimeout,

		AmqpURL: DefaultAmqpURL,

		MainChainGasFeeCap: DefaultMainChainGasFeeCap,
		MainChainGasTipCap: DefaultMainChainGasTipCap,

		CheckpointPollInterval:  DefaultCheckpointPollInterval,
		SyncerPollInterval:      DefaultSyncerPollInterval,
		NoACKPollInterval:       DefaultNoACKPollInterval,
		ClerkPollInterval:       DefaultClerkPollInterval,
		SpanPollInterval:        DefaultSpanPollInterval,
		MilestonePollInterval:   DefaultMilestonePollInterval,
		EnableSH:                DefaultEnableSH,
		SHStateSyncedInterval:   DefaultSHStateSyncedInterval,
		SHCheckpointAckInterval: DefaultSHCheckpointAckInterval,
		SHMaxDepthDuration:      DefaultSHMaxDepthDuration,

		NoACKWaitTime: NoACKWaitTime,

		LogsType:       DefaultLogsType,
		Chain:          DefaultChain,
		LogsWriterFile: "", // default to stdout

		MaxGoRoutineThreshold:  0,
		WarnGoRoutineThreshold: 0,
		MinPeerThreshold:       0,
		WarnPeerThreshold:      0,
	}
}

// GetConfig returns the cached configuration object
func GetConfig() CustomConfig {
	return conf.Custom
}

//
// Get main/pos clients
//

// GetMainChainRPCClient returns main chain RPC client
func GetMainChainRPCClient() *rpc.Client {
	return mainRPCClient
}

// GetMainClient returns main chain's eth client
func GetMainClient() *ethclient.Client {
	return mainChainClient
}

// GetGiltClient returns gilt eth client
func GetGiltClient() *ethclient.Client {
	return giltClient
}

// GetGiltRPCClient returns gilt RPC client
func GetGiltRPCClient() *rpc.Client {
	return giltRPCClient
}

// GetPrivKey returns priv key object
func GetPrivKey() secp256k1.PrivKey {
	return privKeyObject
}

// GetPubKey returns pub key object
func GetPubKey() secp256k1.PubKey {
	return pubKeyObject
}

// GetAddress returns address object
func GetAddress() []byte {
	return GetPubKey().Address()
}

// GetAddressString returns the address object as string
func GetAddressString() (string, error) {
	address := GetAddress()
	ac := addressCodec.NewHexCodec()
	addressString, err := ac.BytesToString(address)
	if err != nil {
		return "", err
	}
	return addressString, nil
}

// GetValidChains returns all the valid chains
func GetValidChains() []string {
	return []string{"mainnet", "gilttestnet", "local"}
}

func GetRioHeight() int64 {
	return rioHeight
}

func IsRio(blockNum uint64) bool {
	return blockNum >= uint64(rioHeight)
}

func SetRioHeight(height int64) {
	rioHeight = height
}

func GetTallyFixHeight() int64 {
	return tallyFixHeight
}

func GetDisableVPCheckHeight() int64 {
	return disableVPCheckHeight
}

func GetDisableValSetCheckHeight() int64 {
	return disableValSetCheckHeight
}

func GetInitialHeight() int64 {
	return initialHeight
}

func GetMilestoneDeletionHeight() int64 {
	return milestoneDeletionHeight
}

func GetFaultyMilestoneNumber() uint64 {
	return uint64(faultyMilestoneNumber)
}

func GetSetProducerDowntimeHeight() int64 {
	return producerDowntimeHeight
}

func GetChainManagerAddressMigration(blockNum int64) (ChainManagerAddressMigration, bool) {
	chainMigration := chainManagerAddressMigrations[normalizeChainName(conf.Custom.Chain)]
	if chainMigration == nil {
		chainMigration = chainManagerAddressMigrations["default"]
	}

	result, found := chainMigration[blockNum]

	return result, found
}

func GetProducerVotes() []uint64 {
	return producerVotes
}

func GetFallbackProducerVotes() []uint64 {
	switch normalizeChainName(conf.Custom.Chain) {
	case MainChain:
		return parseProducerVotes(DefaultMainnetProducers)
	case TestnetChain:
		return parseProducerVotes(DefaultGiltTestnetTestnetProducers)
	default:
		return parseProducerVotes(DefaultLocalTestnetProducers)
	}
}

const (
	producerSetLimit    = uint64(3)
	newProducerSetLimit = uint64(4)
)

func GetProducerSetLimit(ctx sdk.Context) uint64 {
	if ctx.BlockHeight() >= GetSetProducerDowntimeHeight() {
		return newProducerSetLimit
	}
	return producerSetLimit
}

const (
	changeProducerThreshold    = 5
	spanRotationBuffer         = 10
	newChangeProducerThreshold = 10
	newSpanRotationBuffer      = 20
)

func GetChangeProducerThreshold(ctx sdk.Context) int64 {
	if ctx.BlockHeight() >= GetSetProducerDowntimeHeight() {
		return newChangeProducerThreshold
	}
	return changeProducerThreshold
}

func GetSpanRotationBuffer(ctx sdk.Context) uint64 {
	if ctx.BlockHeight() >= GetSetProducerDowntimeHeight() {
		return newSpanRotationBuffer
	}
	return spanRotationBuffer
}

// DecorateWithGiltConsensusFlags adds persistent flags for app configs and bind flags with command
func DecorateWithGiltConsensusFlags(cmd *cobra.Command, v *viper.Viper, loggerInstance logger.Logger, caller string) {
	// add the with-app-config flag
	cmd.PersistentFlags().String(
		WithGiltConsensusConfigFlag,
		"",
		"Override of GiltConsensus app config file (default <home>/config/config.json)",
	)

	if err := v.BindPFlag(WithGiltConsensusConfigFlag, cmd.PersistentFlags().Lookup(WithGiltConsensusConfigFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, WithGiltConsensusConfigFlag), "Error", err)
	}

	// add MainRPCUrlFlag flag
	cmd.PersistentFlags().String(
		MainRPCUrlFlag,
		"",
		"Set RPC endpoint for ethereum chain",
	)

	if err := v.BindPFlag(MainRPCUrlFlag, cmd.PersistentFlags().Lookup(MainRPCUrlFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, MainRPCUrlFlag), "Error", err)
	}

	// add GiltRPCUrlFlag flag
	cmd.PersistentFlags().String(
		GiltRPCUrlFlag,
		"",
		"Set RPC endpoint for gilt chain",
	)

	if err := v.BindPFlag(GiltRPCUrlFlag, cmd.PersistentFlags().Lookup(GiltRPCUrlFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, GiltRPCUrlFlag), "Error", err)
	}

	// add GiltGRPCUrlFlag flag
	cmd.PersistentFlags().String(
		GiltGRPCUrlFlag,
		"",
		"Set gRPC endpoint for gilt chain",
	)

	if err := v.BindPFlag(GiltGRPCUrlFlag, cmd.PersistentFlags().Lookup(GiltGRPCUrlFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, GiltGRPCUrlFlag), "Error", err)
	}

	// add GiltGRPCFlagFlag flag
	cmd.PersistentFlags().String(
		GiltGRPCFlagFlag,
		"",
		"gRPC flag for gilt chain",
	)

	if err := v.BindPFlag(GiltGRPCFlagFlag, cmd.PersistentFlags().Lookup(GiltGRPCFlagFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, GiltGRPCFlagFlag), "Error", err)
	}

	// add CometBFTNodeURLFlag flag
	cmd.PersistentFlags().String(
		CometBFTNodeURLFlag,
		"",
		"Set RPC endpoint for CometBFT",
	)

	if err := v.BindPFlag(CometBFTNodeURLFlag, cmd.PersistentFlags().Lookup(CometBFTNodeURLFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, CometBFTNodeURLFlag), "Error", err)
	}

	// add GiltConsensusServerURLFlag flag
	cmd.PersistentFlags().String(
		GiltConsensusServerURLFlag,
		"",
		"Set GiltConsensus REST server endpoint",
	)

	if err := v.BindPFlag(GiltConsensusServerURLFlag, cmd.PersistentFlags().Lookup(GiltConsensusServerURLFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, GiltConsensusServerURLFlag), "Error", err)
	}

	// add GRPCServerURL flag
	cmd.PersistentFlags().String(
		GRPCServerURLFlag,
		"",
		"Set GRPC Server Endpoint",
	)

	if err := v.BindPFlag(GRPCServerURLFlag, cmd.PersistentFlags().Lookup(GRPCServerURLFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, GRPCServerURLFlag), "Error", err)
	}

	// add AmqpURLFlag flag
	cmd.PersistentFlags().String(
		AmqpURLFlag,
		"",
		"Set AMQP endpoint",
	)

	if err := v.BindPFlag(AmqpURLFlag, cmd.PersistentFlags().Lookup(AmqpURLFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, AmqpURLFlag), "Error", err)
	}

	// add CheckpointerPollIntervalFlag flag
	cmd.PersistentFlags().String(
		CheckpointerPollIntervalFlag,
		"",
		"Set check point pull interval",
	)

	if err := v.BindPFlag(CheckpointerPollIntervalFlag, cmd.PersistentFlags().Lookup(CheckpointerPollIntervalFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, CheckpointerPollIntervalFlag), "Error", err)
	}

	// add SyncerPollIntervalFlag flag
	cmd.PersistentFlags().String(
		SyncerPollIntervalFlag,
		"",
		"Set syncer pull interval",
	)

	if err := v.BindPFlag(SyncerPollIntervalFlag, cmd.PersistentFlags().Lookup(SyncerPollIntervalFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, SyncerPollIntervalFlag), "Error", err)
	}

	// add NoACKPollIntervalFlag flag
	cmd.PersistentFlags().String(
		NoACKPollIntervalFlag,
		"",
		"Set no acknowledge pull interval",
	)

	if err := v.BindPFlag(NoACKPollIntervalFlag, cmd.PersistentFlags().Lookup(NoACKPollIntervalFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, NoACKPollIntervalFlag), "Error", err)
	}

	// add ClerkPollIntervalFlag flag
	cmd.PersistentFlags().String(
		ClerkPollIntervalFlag,
		"",
		"Set clerk pull interval",
	)

	if err := v.BindPFlag(ClerkPollIntervalFlag, cmd.PersistentFlags().Lookup(ClerkPollIntervalFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, ClerkPollIntervalFlag), "Error", err)
	}

	// add SpanPollIntervalFlag flag
	cmd.PersistentFlags().String(
		SpanPollIntervalFlag,
		"",
		"Set span pull interval",
	)

	if err := v.BindPFlag(SpanPollIntervalFlag, cmd.PersistentFlags().Lookup(SpanPollIntervalFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, SpanPollIntervalFlag), "Error", err)
	}

	// add MilestonePollIntervalFlag flag
	cmd.PersistentFlags().String(
		MilestonePollIntervalFlag,
		DefaultMilestonePollInterval.String(),
		"Set milestone interval",
	)

	if err := v.BindPFlag(MilestonePollIntervalFlag, cmd.PersistentFlags().Lookup(MilestonePollIntervalFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, MilestonePollIntervalFlag), "Error", err)
	}

	// add MainChainGasFeeCapFlag flag
	cmd.PersistentFlags().Int64(
		MainChainGasFeeCapFlag,
		0,
		"Set main chain max gas fee cap for EIP-1559 transactions (in wei)",
	)

	if err := v.BindPFlag(MainChainGasFeeCapFlag, cmd.PersistentFlags().Lookup(MainChainGasFeeCapFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, MainChainGasFeeCapFlag), "Error", err)
	}

	// add MainChainGasTipCapFlag flag
	cmd.PersistentFlags().Int64(
		MainChainGasTipCapFlag,
		0,
		"Set main chain max priority fee (tip) for EIP-1559 transactions (in wei)",
	)

	if err := v.BindPFlag(MainChainGasTipCapFlag, cmd.PersistentFlags().Lookup(MainChainGasTipCapFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, MainChainGasTipCapFlag), "Error", err)
	}

	// add NoACKWaitTimeFlag flag
	cmd.PersistentFlags().String(
		NoACKWaitTimeFlag,
		"",
		"Set time ack service waits to clear buffer and elect new proposer",
	)

	if err := v.BindPFlag(NoACKWaitTimeFlag, cmd.PersistentFlags().Lookup(NoACKWaitTimeFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, NoACKWaitTimeFlag), "Error", err)
	}

	// add chain flag
	cmd.PersistentFlags().String(
		ChainFlag,
		"",
		fmt.Sprintf("Set one of the chains: [%s]", strings.Join(GetValidChains(), ",")),
	)

	if err := v.BindPFlag(ChainFlag, cmd.PersistentFlags().Lookup(ChainFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, ChainFlag), "Error", err)
	}

	// add logsWriterFile flag
	cmd.PersistentFlags().String(
		LogsWriterFileFlag,
		"",
		"Set logs writer file, Default is os.Stdout",
	)

	if err := v.BindPFlag(LogsWriterFileFlag, cmd.PersistentFlags().Lookup(LogsWriterFileFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, LogsWriterFileFlag), "Error", err)
	}

	// add producers flag
	cmd.PersistentFlags().String(
		ProducerVotesFlag,
		"",
		"Set comma-separated list of producer IDs",
	)

	if err := v.BindPFlag(ProducerVotesFlag, cmd.PersistentFlags().Lookup(ProducerVotesFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, caller, ProducerVotesFlag), "Error", err)
	}
}

func (c *CustomAppConfig) UpdateWithFlags(v *viper.Viper, loggerInstance logger.Logger) error {
	const logErrMsg = "Unable to read flag."

	// get the endpoint for the ethereum chain from viper/cobra
	stringConfigValue := v.GetString(MainRPCUrlFlag)
	if stringConfigValue != "" {
		c.Custom.EthRPCUrl = stringConfigValue
	}

	// get endpoint for gilt chain from viper/cobra
	stringConfigValue = v.GetString(GiltRPCUrlFlag)
	if stringConfigValue != "" {
		c.Custom.GiltRPCUrl = stringConfigValue
	}

	// get gRPC flag for gilt chain from viper/cobra
	boolConfigValue := v.GetBool(GiltGRPCFlagFlag)
	if boolConfigValue {
		c.Custom.GiltGRPCFlag = boolConfigValue
	}

	// get endpoint for gilt chain from viper/cobra
	stringConfigValue = v.GetString(GiltGRPCUrlFlag)
	if stringConfigValue != "" {
		c.Custom.GiltGRPCUrl = stringConfigValue
	}

	// get endpoint for cometBFT from viper/cobra
	stringConfigValue = v.GetString(CometBFTNodeURLFlag)
	if stringConfigValue != "" {
		c.Custom.CometBFTRPCUrl = stringConfigValue
	}

	// get endpoint for CometBFT from viper/cobra
	stringConfigValue = v.GetString(AmqpURLFlag)
	if stringConfigValue != "" {
		c.Custom.AmqpURL = stringConfigValue
	}

	// get GiltConsensus REST server endpoint from viper/cobra
	stringConfigValue = v.GetString(GiltConsensusServerURLFlag)
	if stringConfigValue != "" {
		c.API.Enable = true
		c.API.Address = stringConfigValue
	}

	// get GiltConsensus GRPC server endpoint from viper/cobra
	stringConfigValue = v.GetString(GRPCServerURLFlag)
	if stringConfigValue != "" {
		c.GRPC.Enable = true
		c.GRPC.Address = stringConfigValue
	}

	// need this error for parsing Duration values
	var err error

	// get the checkpoint poll interval from viper/cobra
	stringConfigValue = v.GetString(CheckpointerPollIntervalFlag)
	if stringConfigValue != "" {
		if c.Custom.CheckpointPollInterval, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", CheckpointerPollIntervalFlag, "Error", err)
			return err
		}
	}

	// get syncer pull interval from viper/cobra
	stringConfigValue = v.GetString(SyncerPollIntervalFlag)
	if stringConfigValue != "" {
		if c.Custom.SyncerPollInterval, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", SyncerPollIntervalFlag, "Error", err)
			return err
		}
	}

	// get the poll interval for ack service to send no-ack in case of no checkpoints from viper/cobra
	stringConfigValue = v.GetString(NoACKPollIntervalFlag)
	if stringConfigValue != "" {
		if c.Custom.NoACKPollInterval, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", NoACKPollIntervalFlag, "Error", err)
			return err
		}
	}

	// get clerk poll interval from viper/cobra
	stringConfigValue = v.GetString(ClerkPollIntervalFlag)
	if stringConfigValue != "" {
		if c.Custom.ClerkPollInterval, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", ClerkPollIntervalFlag, "Error", err)
			return err
		}
	}

	// get span poll interval from viper/cobra
	stringConfigValue = v.GetString(SpanPollIntervalFlag)
	if stringConfigValue != "" {
		if c.Custom.SpanPollInterval, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", SpanPollIntervalFlag, "Error", err)
			return err
		}
	}

	// get milestone poll interval from viper/cobra
	stringConfigValue = v.GetString(MilestonePollIntervalFlag)
	if stringConfigValue != "" {
		if c.Custom.MilestonePollInterval, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", MilestonePollIntervalFlag, "Error", err)
			return err
		}
	}

	// get time that ack service waits to clear buffer and elect the new proposer from viper/cobra
	stringConfigValue = v.GetString(NoACKWaitTimeFlag)
	if stringConfigValue != "" {
		if c.Custom.NoACKWaitTime, err = time.ParseDuration(stringConfigValue); err != nil {
			loggerInstance.Error(logErrMsg, "Flag", NoACKWaitTimeFlag, "Error", err)
			return err
		}
	}

	// get mainChain gas fee cap from viper/cobra. if it is greater than zero, set it as a configuration parameter
	int64ConfigValue := v.GetInt64(MainChainGasFeeCapFlag)
	if int64ConfigValue > 0 {
		c.Custom.MainChainGasFeeCap = int64ConfigValue
	}

	// get mainChain gas tip cap from viper/cobra
	int64ConfigValue = v.GetInt64(MainChainGasTipCapFlag)
	if int64ConfigValue > 0 {
		c.Custom.MainChainGasTipCap = int64ConfigValue
	}

	// get chain from viper/cobra flag
	stringConfigValue = v.GetString(ChainFlag)
	if stringConfigValue != "" {
		c.Custom.Chain = normalizeChainName(stringConfigValue)
	}

	stringConfigValue = v.GetString(LogsWriterFileFlag)
	if stringConfigValue != "" {
		c.Custom.LogsWriterFile = stringConfigValue
	}

	// get producer votes from viper/cobra flag
	stringConfigValue = v.GetString(ProducerVotesFlag)
	if stringConfigValue != "" {
		c.Custom.ProducerVotes = stringConfigValue
	}

	return nil
}

func (c *CustomAppConfig) Merge(cc *CustomConfig) {
	if cc.EthRPCUrl != "" {
		c.Custom.EthRPCUrl = cc.EthRPCUrl
	}

	if cc.GiltRPCUrl != "" {
		c.Custom.GiltRPCUrl = cc.GiltRPCUrl
	}

	if !cc.GiltGRPCFlag {
		c.Custom.GiltGRPCFlag = cc.GiltGRPCFlag
	}

	if cc.GiltGRPCUrl != "" {
		c.Custom.GiltGRPCUrl = cc.GiltGRPCUrl
	}

	if cc.CometBFTRPCUrl != "" {
		c.Custom.CometBFTRPCUrl = cc.CometBFTRPCUrl
	}

	if cc.AmqpURL != "" {
		c.Custom.AmqpURL = cc.AmqpURL
	}

	if cc.MainChainGasFeeCap != 0 {
		c.Custom.MainChainGasFeeCap = cc.MainChainGasFeeCap
	}

	if cc.MainChainGasTipCap != 0 {
		c.Custom.MainChainGasTipCap = cc.MainChainGasTipCap
	}

	if cc.CheckpointPollInterval != 0 {
		c.Custom.CheckpointPollInterval = cc.CheckpointPollInterval
	}

	if cc.SyncerPollInterval != 0 {
		c.Custom.SyncerPollInterval = cc.SyncerPollInterval
	}

	if cc.NoACKPollInterval != 0 {
		c.Custom.NoACKPollInterval = cc.NoACKPollInterval
	}

	if cc.ClerkPollInterval != 0 {
		c.Custom.ClerkPollInterval = cc.ClerkPollInterval
	}

	if cc.SpanPollInterval != 0 {
		c.Custom.SpanPollInterval = cc.SpanPollInterval
	}

	if cc.MilestonePollInterval != 0 {
		c.Custom.MilestonePollInterval = cc.MilestonePollInterval
	}

	if cc.SHCheckpointAckInterval != 0 {
		c.Custom.SHCheckpointAckInterval = cc.SHCheckpointAckInterval
	}

	if cc.NoACKWaitTime != 0 {
		c.Custom.NoACKWaitTime = cc.NoACKWaitTime
	}

	if cc.Chain != "" {
		c.Custom.Chain = normalizeChainName(cc.Chain)
	}

	if cc.LogsWriterFile != "" {
		c.Custom.LogsWriterFile = cc.LogsWriterFile
	}

	// Add merge logic for Producers if necessary, though flags and direct config usually take precedence.
	// If the direct config file sets it, it's already in c.Custom.Producers before merge.
	// If the override file (cc) sets it, we might want to let it override.
	if cc.ProducerVotes != "" {
		c.Custom.ProducerVotes = cc.ProducerVotes
	}
}

// DecorateWithCometBFTFlags creates cometBFT flags for the desired command and binds them to viper
func DecorateWithCometBFTFlags(cmd *cobra.Command, v *viper.Viper, loggerInstance logger.Logger, message string) {
	// add seeds flag
	cmd.PersistentFlags().String(
		SeedsFlag,
		"",
		"Override seeds",
	)

	if err := v.BindPFlag(SeedsFlag, cmd.PersistentFlags().Lookup(SeedsFlag)); err != nil {
		loggerInstance.Error(fmt.Sprintf(bindPFlagLog, message, SeedsFlag), "Error", err)
	}
}

// UpdateCometBFTConfig updates cometBFT config with flags and default values if needed
func UpdateCometBFTConfig(cometBFTConfig *cfg.Config, v *viper.Viper) {
	// update cometBFTConfig.P2P.Seeds
	seedsFlagValue := v.GetString(SeedsFlag)
	if seedsFlagValue != "" {
		cometBFTConfig.P2P.Seeds = seedsFlagValue
	}

	if cometBFTConfig.P2P.Seeds == "" {
		switch normalizeChainName(conf.Custom.Chain) {
		case MainChain:
			cometBFTConfig.P2P.Seeds = DefaultMainnetSeeds
		case TestnetChain:
			cometBFTConfig.P2P.Seeds = DefaultGiltTestnetTestnetSeeds
		}
	}
}

func GetLogsWriter(logsWriterFile string) io.Writer {
	if logsWriterFile != "" {
		logWriter, err := os.OpenFile(logsWriterFile, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0o666)
		if err != nil {
			log.Fatalf("error opening log writer file: %v", err)
		}

		return logWriter
	}
	return os.Stdout
}

// Sanitize enforces minimums and returns notes and corrected key/values
func (c *CustomAppConfig) Sanitize() (notes []string, kv map[string]any) {
	kv = make(map[string]any)

	if c.MinRetainBlocks != 0 && c.MinRetainBlocks < EnforcedMinRetainBlocks {
		c.MinRetainBlocks = EnforcedMinRetainBlocks
		notes = append(notes, fmt.Sprintf("min-retain-blocks=%d (minimum enforced)", EnforcedMinRetainBlocks))
		kv["min-retain-blocks"] = EnforcedMinRetainBlocks
	}

	return notes, kv
}
