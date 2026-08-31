#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspace"
ROUGHNET="$ROOT/.tmp/roughnet"
WALLETS="$ROOT/.roughnet-wallets"
GETH="$ROOT/gilt-chain/build/bin/geth"
GILTCONSD="$ROOT/bridge/gilt-consensus/build/giltconsd"
GETH_DATA="$ROUGHNET/geth"
GILTCONS_HOME="$ROUGHNET/giltconsd"
GETH_PID_FILE="$ROUGHNET/geth.pid"
GILTCONS_PID_FILE="$ROUGHNET/giltconsd.pid"
GETH_LOG="$ROUGHNET/geth.log"
GILTCONS_LOG="$ROUGHNET/giltconsd.log"

if [[ ! -f "$WALLETS/evm-wallets.json" || ! -d "$GETH_DATA/geth" || ! -f "$GILTCONS_HOME/config/genesis.json" ]]; then
  "$ROOT/scripts/roughnet/setup-roughnet.sh"
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

if [[ -f "$GILTCONS_PID_FILE" ]] && kill -0 "$(cat "$GILTCONS_PID_FILE")" 2>/dev/null; then
  echo "giltconsd already running pid=$(cat "$GILTCONS_PID_FILE")"
else
  for _ in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8545 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  nohup "$GILTCONSD" start \
    --home "$GILTCONS_HOME" \
    --rpc.laddr tcp://127.0.0.1:26657 \
    --rest-server=false \
    --grpc.enable=false \
    --bridge-mode non-bridge \
    >"$GILTCONS_LOG" 2>&1 &
  echo $! >"$GILTCONS_PID_FILE"
  echo "started giltconsd pid=$(cat "$GILTCONS_PID_FILE")"
fi
