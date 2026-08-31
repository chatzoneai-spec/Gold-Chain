#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspace"
GETH="$ROOT/gilt-chain/build/bin/geth"
GILTCONSD="$ROOT/bridge/gilt-consensus/build/giltconsd"
GENESIS_SRC="$ROOT/gilt-genesis-contract/genesis-roughnet.json"
ROUGHNET="$ROOT/.tmp/roughnet"
WALLETS="$ROOT/.roughnet-wallets"
GETH_DATA="$ROUGHNET/geth"
GILTCONS_HOME="$ROUGHNET/giltconsd"
TESTNET_GEN="$ROUGHNET/testnet-gen"

export PATH="$HOME/.foundry/bin:$PATH"

mkdir -p "$ROUGHNET" "$WALLETS" "$GETH_DATA/keystore" "$GILTCONS_HOME"

if [[ -x "$ROOT/gilt-genesis-contract/.venv/bin/python" ]]; then
  (cd "$ROOT/gilt-genesis-contract" && bash scripts/generate-roughnet.sh) || true
else
  (cd "$ROOT/gilt-genesis-contract" && bash scripts/generate-roughnet.sh) || true
fi

if [[ ! -f "$GENESIS_SRC" ]]; then
  cp "$ROOT/gilt-genesis-contract/genesis-dev.json" "$GENESIS_SRC"
fi

printf 'roughnet-validator\n' > "$ROUGHNET/validator-password.txt"
printf 'roughnet-bls\n' > "$ROUGHNET/bls-password.txt"

if [[ ! -f "$WALLETS/evm-wallets.json" ]]; then
  "$GETH" account new --datadir "$GETH_DATA" --password "$ROUGHNET/validator-password.txt" >/dev/null
  "$GETH" bls account new --datadir "$GETH_DATA" --blspassword "$ROUGHNET/bls-password.txt" >/dev/null
  "$GETH" account new --datadir "$GETH_DATA" --password "$ROUGHNET/validator-password.txt" >/dev/null
  "$GETH" account new --datadir "$GETH_DATA" --password "$ROUGHNET/validator-password.txt" >/dev/null

  python3 - <<'PY'
import json, hashlib, subprocess
from pathlib import Path
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import scrypt as crypto_scrypt

def decrypt_keystore(keyfile, password):
    with open(keyfile) as f:
        data = json.load(f)
    crypto = data['crypto']
    p = crypto['kdfparams']
    if crypto['kdf'] == 'scrypt':
        derived = crypto_scrypt(password.encode(), bytes.fromhex(p['salt']), p['dklen'], N=p['n'], r=p['r'], p=p['p'])
    else:
        derived = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(p['salt']), p['c'])
    iv = bytes.fromhex(crypto['cipherparams']['iv'])
    cipher = AES.new(derived[:16], AES.MODE_CTR, nonce=b'', initial_value=iv)
    return '0x' + cipher.decrypt(bytes.fromhex(crypto['ciphertext'])).hex()

password = 'roughnet-validator'
keystore = Path('/workspace/.tmp/roughnet/geth/keystore')
wallets = []
for kf in sorted(keystore.glob('UTC--*')):
    with open(kf) as f:
        j = json.load(f)
    wallets.append({'address': '0x' + j['address'], 'private_key': decrypt_keystore(kf, password)})
Path('/workspace/.roughnet-wallets/evm-wallets.json').write_text(json.dumps(wallets, indent=2) + '\n')
PY
fi

VALIDATOR_ADDR=$(python3 -c "import json; print(json.load(open('$WALLETS/evm-wallets.json'))[0]['address'])")
BLS_PUBKEY=$("$GETH" bls account list --datadir "$GETH_DATA" --blspassword "$ROUGHNET/bls-password.txt" 2>/dev/null | awk '/\[BLS public key\]/ {print $NF}')

python3 - <<PY
import json
from pathlib import Path

genesis_path = Path('$GENESIS_SRC')
g = json.loads(genesis_path.read_text())
validator = '$VALIDATOR_ADDR'
old = 'e45c84ac57b2ff6f3881ee1e9c76de1517d328ae'
for k in list(g['alloc'].keys()):
    if k.lower() == old:
        del g['alloc'][k]
fund_hex = hex(10000 * 10**18)
for addr in json.load(open('$WALLETS/evm-wallets.json')):
    a = addr['address']
    entry = {}
    for k in list(g['alloc'].keys()):
        if k.lower() == a.lower():
            entry = g['alloc'][k]
            del g['alloc'][k]
    entry['balance'] = fund_hex
    g['alloc'][a] = entry
genesis_path.write_text(json.dumps(g, indent=2) + '\n')
PY

NODE_PATH="$ROOT/gilt-genesis-contract/node_modules" node "$ROOT/scripts/roughnet/patch-genesis-validator.js" "$GENESIS_SRC" "$VALIDATOR_ADDR" "$BLS_PUBKEY"

rm -rf "$GETH_DATA/geth"
"$GETH" --datadir "$GETH_DATA" init "$GENESIS_SRC"

rm -rf "$TESTNET_GEN"
"$GILTCONSD" create-testnet \
  --v 4 \
  --n 0 \
  -o "$TESTNET_GEN" \
  --chain-id giltconsensus-714 \
  --home "$GILTCONS_HOME" \
  --allow-duplicate-ip

"$ROOT/scripts/roughnet/configure-giltconsd-cluster.sh"

cat > "$ROUGHNET/roughnet-public.json" <<EOF
{
  "validator_address": "$VALIDATOR_ADDR",
  "bls_pubkey": "$BLS_PUBKEY",
  "geth_datadir": "$GETH_DATA",
  "giltconsd_home": "$GILTCONS_HOME",
  "chain_id": 714,
  "consensus_chain_id": "giltconsensus-714"
}
EOF

echo "roughnet setup complete"
echo "validator=$VALIDATOR_ADDR"
echo "bls_pubkey=$BLS_PUBKEY"
