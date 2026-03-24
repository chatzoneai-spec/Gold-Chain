const web3 = require('web3');
const RLP = require('rlp');

// Configure
const validators = [
  {
    consensusAddr: '0xE45c84ac57b2FF6F3881EE1E9C76DE1517D328AE',
    feeAddr: '0xE45c84ac57b2FF6F3881EE1E9C76DE1517D328AE',
    bscFeeAddr: '0xE45c84ac57b2FF6F3881EE1E9C76DE1517D328AE',
    votingPower: 0x0000000000000064,
  },
];
const bLSPublicKeys = [
  '0x82106fca090df4d75d8a0e40e71fe47619ce9a9d5425063e734e40dca8a1f536443ea556a68e715496c8753c1be83f02',
];

// ======== Do not edit below ========
function generateExtraData(validators) {
  let extraVanity = Buffer.alloc(32);
  let validatorsBytes = extraDataSerialize(validators);
  let extraSeal = Buffer.alloc(65);
  return Buffer.concat([extraVanity, validatorsBytes, extraSeal]);
}

function extraDataSerialize(validators) {
  let n = validators.length;
  let arr = [];
  for (let i = 0; i < n; i++) {
    let validator = validators[i];
    arr.push(Buffer.from(web3.utils.hexToBytes(validator.consensusAddr)));
  }
  return Buffer.concat(arr);
}

function validatorUpdateRlpEncode(validators, bLSPublicKeys) {
  let n = validators.length;
  let vals = [];
  for (let i = 0; i < n; i++) {
    vals.push([
      validators[i].consensusAddr,
      validators[i].bscFeeAddr,
      validators[i].feeAddr,
      validators[i].votingPower,
      bLSPublicKeys[i],
    ]);
  }
  let pkg = [0x00, vals];
  return web3.utils.bytesToHex(RLP.encode(pkg));
}

extraValidatorBytes = generateExtraData(validators);
validatorSetBytes = validatorUpdateRlpEncode(validators, bLSPublicKeys);

exports = module.exports = {
  extraValidatorBytes: extraValidatorBytes,
  validatorSetBytes: validatorSetBytes,
};
