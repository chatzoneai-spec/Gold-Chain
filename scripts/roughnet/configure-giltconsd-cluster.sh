#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspace"
ROUGHNET="$ROOT/.tmp/roughnet"
TESTNET_GEN="$ROUGHNET/testnet-gen"
GILTCONSD="$ROOT/bridge/gilt-consensus/build/giltconsd"
GILTCONS_HOME="$ROUGHNET/giltconsd"

FORCE_RECREATE=0
if [[ "${1:-}" == "--force-recreate" ]]; then
  FORCE_RECREATE=1
fi

if [[ "$FORCE_RECREATE" -eq 1 ]] || [[ ! -d "$TESTNET_GEN/node0/giltconsd" ]]; then
  rm -rf "$TESTNET_GEN"
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
import shutil
import subprocess
from pathlib import Path

root = Path('/workspace/.tmp/roughnet/testnet-gen')
giltconsd = Path('/workspace/bridge/gilt-consensus/build/giltconsd')
nodes = [
    (0, 26656, 26657, 1317),
    (1, 26666, 26667, 1327),
    (2, 26676, 26677, 1337),
    (3, 26686, 26687, 1347),
]

node_ids = []
for idx, p2p_port, _rpc_port, _api_port in nodes:
    home = root / f'node{idx}' / 'giltconsd'
    node_id = subprocess.check_output(
        [str(giltconsd), 'tendermint', 'show-node-id', '--home', str(home)],
        text=True,
    ).strip()
    node_ids.append((node_id, p2p_port))

peers = ','.join(f'{node_id}@127.0.0.1:{p2p_port}' for node_id, p2p_port in node_ids)

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
if primary.exists():
    shutil.rmtree(primary)
shutil.copytree(root / 'node0' / 'giltconsd', primary)

print(f'configured 4-node giltconsd cluster peers={peers}')
PY
