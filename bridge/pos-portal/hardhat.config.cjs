require('@nomiclabs/hardhat-truffle5');
require('hardhat/config');
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-web3");

const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require('hardhat/builtin-tasks/task-names');
const path = require('path');

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
  const paths = await runSuper();
  return [...paths, path.join(__dirname, 'test/fixtures')];
});

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

module.exports = {
  solidity: {
    version: '0.6.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: 'istanbul'
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      hardfork: "istanbul", // disables EIP-1559, only legacy txs
    },
    development: {
      url: 'http://localhost:9545',
      gas: 7000000,
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    root: {
      url: 'http://localhost:9545',
      gas: 7000000,
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    child: {
      url: 'http://localhost:8545',
      gas: 7000000,
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    testnetRoot: {
      url: `https://sepolia.infura.io/v3/${process.env.API_KEY}`,
      gas: 7000000,
      gasPrice: 10000000000, // 10 gwei
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    testnetChild: {
      url: process.env.CHILD_TESTNET_RPC_URL || 'http://localhost:8545',
      gas: 7000000,
      gasPrice: 10000000000, // 10 gwei
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    mainnetRoot: {
      url: `https://mainnet.infura.io/v3/${process.env.API_KEY}`,
      gas: 7000000,
      gasPrice: 10000000000, // 10 gwei
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    mainnetChild: {
      url: process.env.CHILD_MAINNET_RPC_URL || 'http://localhost:8545',
      gas: 7000000,
      gasPrice: 10000000000, // 10 gwei
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    }
  }
}
