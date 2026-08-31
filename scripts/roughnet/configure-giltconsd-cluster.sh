#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspace"
ROUGHNET="$ROOT/.tmp/roughnet"
TESTNET_GEN="$ROUGHNET/testnet-gen"
GILTCONSD="$ROOT/bridge/gilt-consensus/build/giltconsd"
GILTCONS_HOME="$ROUGHNET/giltconsd"

PEERS="118a6b0a3599edfad0d33f69bb343d73dcf06ffb@127.0.0.1:26656,7075e60af7b595ea87ab394853acf3db7e59923b@127.0.0.1:26666,a368c94782bfc5076c5252610c29636d9eca1bba@127.0.0.1:26676,da2a1779258fa2f0e58db4fa66a76ad5dd2b0b88@127.0.0.1:26686"

if [[ ! -d "$TESTNET_GEN/node0/giltconsd" ]]; then
  "$GILTCONSD" create-testnet \
    --v 4 \
    --n 0 \
    -o "$TESTNET_GEN" \
    --chain-id giltconsensus-714 \
    --home "$GILTCONS_HOME" \
    --allow-duplicate-ip
fi

python3 - <<'PY'
import json
import re
from pathlib import Path

root = Path('/workspace/.tmp/roughnet/testnet-gen')
peers = '118a6b0a3599edfad0d33f69bb343d73dcf06ffb@127.0.0.1:26656,7075e60af7b595ea87ab394853acf3db7e59923b@127.0.0.1:26666,a368c94782bfc5076c5252610c29636d9eca1bba@127.0.0.1:26676,da2a1779258fa2f0e58db4fa66a76ad5dd2b0b88@127.0.0.1:26686'
nodes = [
    (0, 26656, 26657, 1317),
    (1, 26666, 26667, 1327),
    (2, 26676, 26677, 1337),
    (3, 26686, 26687, 1347),
]

for idx, p2p_port, rpc_port, api_port in nodes:
    home = root / f'node{idx}' / 'giltconsd'
    genesis_path = home / 'config' / 'genesis.json'
    genesis = json.loads(genesis_path.read_text())
    cm = genesis['app_state']['chainmanager']['params']['chain_params']
    cm['gilt_chain_id'] = '714'
    cm['giltconsensus_chain_id'] = 'giltconsensus-714'
    for span in genesis['app_state'].get('gilt', {}).get('spans', []):
        span['gilt_chain_id'] = '714'
    genesis_path.write_text(json.dumps(genesis, indent=2) + '\n')

    for name in ('app.toml', 'config.toml', 'client.toml'):
        cfg = home / 'config' / name
        if not cfg.exists():
            continue
        text = cfg.read_text()
        text = text.replace('http://localhost:9545', 'http://127.0.0.1:8545')
        text = text.replace('http://localhost:8545', 'http://127.0.0.1:8545')
        text = text.replace('http://0.0.0.0:26657', f'http://127.0.0.1:{rpc_port}')
        text = text.replace('tcp://0.0.0.0:26656', f'tcp://127.0.0.1:{p2p_port}')
        text = text.replace('tcp://0.0.0.0:26657', f'tcp://127.0.0.1:{rpc_port}')
        text = text.replace('tcp://0.0.0.0:1317', f'tcp://127.0.0.1:{api_port}')
        text = text.replace('pex = true', 'pex = false')
        text = re.sub(r'^max_num_inbound_peers = \d+$', 'max_num_inbound_peers = 3', text, flags=re.M)
        text = re.sub(r'^max_num_outbound_peers = \d+$', 'max_num_outbound_peers = 3', text, flags=re.M)
        text = re.sub(r'^seeds = ".*"$', 'seeds = ""', text, flags=re.M)
        text = re.sub(r'^persistent_peers = ".*"$', f'persistent_peers = "{peers}"', text, flags=re.M)
        text = re.sub(r'^external_address = ".*"$', f'external_address = "127.0.0.1:{p2p_port}"', text, flags=re.M)
        text = re.sub(r'^laddr = "tcp://[^"]*:26656"$', f'laddr = "tcp://127.0.0.1:{p2p_port}"', text, flags=re.M)
        text = re.sub(r'^laddr = "tcp://[^"]*:26657"$', f'laddr = "tcp://127.0.0.1:{rpc_port}"', text, flags=re.M)
        cfg.write_text(text)

    data = home / 'data'
    if data.exists():
        import shutil
        for child in data.iterdir():
            if child.is_file():
                child.unlink()
            else:
                shutil.rmtree(child)
    else:
        data.mkdir(parents=True, exist_ok=True)

    template = Path('/workspace/bridge/gilt-consensus/packaging/templates/config/priv_validator_state.json')
    shutil.copy(template, data / 'priv_validator_state.json')

primary = Path('/workspace/.tmp/roughnet/giltconsd')
import shutil
if primary.exists():
    shutil.rmtree(primary)
shutil.copytree(root / 'node0' / 'giltconsd', primary)
PY

echo "configured 4-node giltconsd cluster"
