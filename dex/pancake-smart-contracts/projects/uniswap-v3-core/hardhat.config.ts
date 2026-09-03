import type { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";
import { subtask } from "hardhat/config";
import {
  TASK_COMPILE_GET_REMAPPINGS,
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
} from "hardhat/builtin-tasks/task-names";
import "@nomiclabs/hardhat-ethers";
import fs from "fs";
import path from "path";
import "dotenv/config";

function collectSolFiles(dir: string, projectRoot: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSolFiles(fullPath, projectRoot));
    } else if (entry.name.endsWith(".sol")) {
      results.push(path.relative(projectRoot, fullPath).split(path.sep).join("/"));
    }
  }
  return results;
}

subtask(TASK_COMPILE_GET_REMAPPINGS).setAction(async (_, __, runSuper) => {
  const parent = await runSuper();
  return {
    ...parent,
    "@uniswap/v3-core/contracts/": "contracts/core/",
  };
});

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, { config }, runSuper) => {
  const allPaths: string[] = await runSuper();
  const contractPaths = allPaths.filter((sourcePath) => {
    const normalized = sourcePath.split(path.sep).join("/");
    return !normalized.includes("/contracts/core/");
  });

  const testSolPaths = collectSolFiles(path.join(config.paths.root, "test"), config.paths.root);
  return [...contractPaths, ...testSolPaths];
});

const LOW_OPTIMIZER_COMPILER_SETTINGS = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 2_000,
    },
    metadata: {
      bytecodeHash: "none",
    },
  },
};

const LOWEST_OPTIMIZER_COMPILER_SETTINGS = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 1_000,
    },
    metadata: {
      bytecodeHash: "none",
    },
  },
};

const bscTestnet: NetworkUserConfig = {
  url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
  chainId: 97,
  accounts: process.env.KEY_TESTNET ? [process.env.KEY_TESTNET] : [],
};

const bscMainnet: NetworkUserConfig = {
  url: "https://gilt-dataseed.binance.org/",
  chainId: 56,
  accounts: process.env.KEY_MAINNET ? [process.env.KEY_MAINNET] : [],
};

const goldChain: NetworkUserConfig = {
  url:
    process.env.GOLD_CHAIN_RPC_URL ||
    process.env.NEXT_PUBLIC_GOLD_CHAIN_RPC ||
    "http://127.0.0.1:8545",
  chainId: 714,
  accounts: process.env.KEY_GOLDCHAIN ? [process.env.KEY_GOLDCHAIN] : [],
};

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 714,
      allowUnlimitedContractSize: false,
      hardfork: "istanbul",
    },
    testnet: bscTestnet,
    mainnet: bscMainnet,
    goldchain: goldChain,
  },
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
          },
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
    ],
    overrides: {
      "contracts/periphery/NonfungiblePositionManager.sol": LOW_OPTIMIZER_COMPILER_SETTINGS,
      "contracts/periphery/NonfungibleTokenPositionDescriptor.sol": LOWEST_OPTIMIZER_COMPILER_SETTINGS,
      "contracts/periphery/libraries/NFTDescriptor.sol": LOWEST_OPTIMIZER_COMPILER_SETTINGS,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
