package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"

	"github.com/QuarkChain/goquarkchain/common/hexutil"
	"github.com/QuarkChain/goquarkchain/internal/qkcapi"
	"github.com/QuarkChain/goquarkchain/rpc"
	"github.com/ybbus/jsonrpc"
)

var configFile = flag.String("config", "", "config file")

type ShardConfig struct {
	FullShardID hexutil.Uint
	EthChainID  uint32
}

type Config struct {
	QkcRPC       string
	VHost        []string
	ShardConfigs []ShardConfig
	RPC          string
	ChainID      uint32
	ShardSize    uint32
}

func loadConfig(file string) *Config {
	data, err := ioutil.ReadFile(file)
	if err != nil {
		log.Fatalf("Failed to read config: %v", err)
	}
	c := new(Config)
	if err := json.Unmarshal(data, c); err != nil {
		log.Fatalf("Failed to parse config: %v", err)
	}
	return c
}

func main() {
	flag.Parse()
	config := loadConfig(*configFile)
	qkcClient := jsonrpc.NewClient(config.QkcRPC)

	if config.ShardSize == 0 {
		log.Fatal("ShardSize must be specified")
	}
	if config.RPC == "" {
		log.Fatal("RPC must be specified")
	}
	if config.ChainID == 0 {
		log.Fatal("ChainID must be specified")
	}
	if uint32(len(config.ShardConfigs)) != config.ShardSize {
		log.Fatalf("Expected %d shard configs, got %d", config.ShardSize, len(config.ShardConfigs))
	}

	shards := make([]qkcapi.ShardInfo, len(config.ShardConfigs))
	for i, sc := range config.ShardConfigs {
		shards[i] = qkcapi.ShardInfo{
			FullShardID: uint32(sc.FullShardID),
			ChainID:     sc.EthChainID,
		}
	}

	api, err := qkcapi.NewUnifiedShardAPI(config.ShardSize, config.ChainID, shards, qkcClient)
	if err != nil {
		log.Fatalf("Failed to create API: %v", err)
	}

	apis := []rpc.API{
		{
			Namespace: "eth",
			Version:   "1.0",
			Service:   api,
			Public:    true,
		},
		{
			Namespace: "net",
			Version:   "1.0",
			Service:   qkcapi.NewNetApi(qkcClient),
			Public:    true,
		},
		{
			Namespace: "web3",
			Version:   "1.0",
			Service:   qkcapi.NewWeb3Api(qkcClient),
			Public:    true,
		},
	}

	_, _, err = rpc.StartHTTPEndpoint(config.RPC, apis, []string{"eth", "net", "web3"}, nil, config.VHost, rpc.DefaultHTTPTimeouts)
	if err != nil {
		log.Fatalf("Failed to start HTTP endpoint: %v", err)
	}

	fmt.Printf("Started on %s (ShardSize=%d, ChainID=%d)\n", config.RPC, config.ShardSize, config.ChainID)

	select {}
}
