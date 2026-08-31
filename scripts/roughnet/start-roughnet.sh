#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspace"
ROUGHNET="$ROOT/.tmp/roughnet"
WALLETS="$ROOT/.roughnet-wallets"
GETH="$ROOT/gilt-chain/build/bin/geth"
GILTCONSD="$ROOT/bridge/gilt-consensus/build/giltconsd"
GETH_DATA="$ROUGHNET/geth"
TESTNET_GEN="$ROUGHNET/testnet-gen"
GETH_PID_FILE="$ROUGHNET/geth.pid"
GILTCONS_PID_FILE="$ROUGHNET/giltconsd.pid"
GETH_LOG="$ROUGHNET/geth.log"
GILTCONS_LOG="$ROUGHNET/giltconsd.log"

if [[ ! -f "$WALLETS/evm-wallets.json" || ! -d "$GETH_DATA/geth" || ! -f "$TESTNET_GEN/node0/giltconsd/config/genesis.json" ]]; then
  "$ROOT/scripts/roughnet/setup-roughnet.sh"
fi

if [[ ! -f "$TESTNET_GEN/node3/giltconsd/config/config.toml" ]]; then
  "$ROOT/scripts/roughnet/configure-giltconsd-cluster.sh"
fi

VALIDATOR_ADDR=$(python3 -c "import json; print(json.load(open('$WALLETS/evm-wallets.json'))[0]['address'])")

if [[ -f "$GETH_PID_FILE" ]] && kill -0 "$(cat "$GETH_PID_FILE")" 2>/dev/null; then
  echo "geth already running pid=$(cat "$GETH_PID_FILE")"
else
  nohup "$GETH" \
    --datadir "$GETH_DATA" \
    --networkid 714 \
    --mine \
    --unlock "$VALIDATOR_ADDR" \
    --password "$ROUGHNET/validator-password.txt" \
    --allow-insecure-unlock \
    --miner.etherbase "$VALIDATOR_ADDR" \
    --http \
    --http.addr 127.0.0.1 \
    --http.port 8545 \
    --http.api eth,net,web3,personal,txpool \
    --nodiscover \
    --maxpeers 0 \
    --blspassword "$ROUGHNET/bls-password.txt" \
    --blswallet "$GETH_DATA/bls/wallet" \
    >"$GETH_LOG" 2>&1 &
  echo $! >"$GETH_PID_FILE"
  echo "started geth pid=$(cat "$GETH_PID_FILE")"
fi

start_giltconsd_node() {
  local idx="$1"
  local home="$TESTNET_GEN/node${idx}/giltconsd"
  local pid_file="$ROUGHNET/giltconsd-node${idx}.pid"
  local log_file="$ROUGHNET/giltconsd-node${idx}.log"
  local rpc_port api_port
  case "$idx" in
    0) rpc_port=26657; api_port=1317 ;;
    1) rpc_port=26667; api_port=1327 ;;
    2) rpc_port=26677; api_port=1337 ;;
    3) rpc_port=26687; api_port=1347 ;;
  esac

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "giltconsd-node${idx} already running pid=$(cat "$pid_file")"
    return 0
  fi

  nohup "$GILTCONSD" start \
    --home "$home" \
    --rpc.laddr "tcp://127.0.0.1:${rpc_port}" \
    --api.address "tcp://127.0.0.1:${api_port}" \
    --api.enable \
    --grpc.enable=false \
    --bridge-mode non-bridge \
    >"$log_file" 2>&1 &
  echo $! >"$pid_file"
  echo "started giltconsd-node${idx} pid=$(cat "$pid_file") rpc=${rpc_port}"
}

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8545 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for idx in 0 1 2 3; do
  start_giltconsd_node "$idx"
done

if [[ -f "$ROUGHNET/giltconsd-node0.pid" ]]; then
  cp "$ROUGHNET/giltconsd-node0.pid" "$GILTCONS_PID_FILE"
fi
