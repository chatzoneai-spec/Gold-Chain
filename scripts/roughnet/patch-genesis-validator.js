#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const web3 = require('web3');

const GENESIS_ROOT = path.resolve(__dirname, '../../gilt-genesis-contract');
const {
  VALIDATOR_SET_ADDRESS,
  buildGiltValidatorSetStorage,
} = require(path.join(GENESIS_ROOT, 'scripts/lib/launch-storage'));
const {
  loadLaunchConfig,
  validatorExtraData,
} = require(path.join(GENESIS_ROOT, 'scripts/lib/launch-config'));

function usage() {
  console.error('Usage: patch-genesis-validator.js <genesis.json> <consensusAddress> <blsPublicKey>');
  process.exit(1);
}

const [genesisPath, consensusAddress, blsPublicKey] = process.argv.slice(2);
if (!genesisPath || !consensusAddress || !blsPublicKey) {
  usage();
}

const { config } = loadLaunchConfig({ profile: 'testnet' });
config.validators = [
  {
    consensusAddress,
    feeAddress: consensusAddress,
    giltFeeAddress: consensusAddress,
    votingPower: '0x0000000000000064',
    blsPublicKey,
  },
];

const genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf8'));
const validatorSetStorage = buildGiltValidatorSetStorage(config);
const extraData = `0x${validatorExtraData(config).toString('hex')}`;

genesis.extraData = extraData;
genesis.alloc[VALIDATOR_SET_ADDRESS] = genesis.alloc[VALIDATOR_SET_ADDRESS] || { balance: '0x0' };
genesis.alloc[VALIDATOR_SET_ADDRESS].storage = validatorSetStorage;

fs.writeFileSync(genesisPath, `${JSON.stringify(genesis, null, 2)}\n`);
console.log(`patched validator ${consensusAddress} into ${genesisPath}`);
