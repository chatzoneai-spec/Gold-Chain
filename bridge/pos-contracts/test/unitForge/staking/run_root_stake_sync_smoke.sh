#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> Building root stake sync harness"
forge build contracts/staking/stakeManager/RootStakeStateSyncHarness.sol >/dev/null

HARNESS_ARTIFACT="out/RootStakeStateSyncHarness.sol/RootStakeStateSyncHarness.json"
MOCK_ARTIFACT="out/RootStakeStateSyncHarness.sol/MockStateSenderHarness.json"

encode_sig="encodePayload(uint256,address,uint256,uint256,uint8)"
sync_sig="syncPayload(address,address,uint256,address,uint256,uint256,uint8)"
register_sig="register(address,address)"

VALIDATOR_ID=8
SIGNER=0x000000000000000000000000000000000000CAFE
AMOUNT=1000000000000000000000
NONCE=1
STATUS=0
CHILD_HUB=0x000000000000000000000000000000000000bEEF

EXPECTED_PAYLOAD=$(cast abi-encode "f(uint256,address,uint256,uint256,uint8)" \
  "$VALIDATOR_ID" "$SIGNER" "$AMOUNT" "$NONCE" "$STATUS")

RPC_URL=http://127.0.0.1:18545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f8ff80
FROM=$(cast wallet address --private-key "$PRIVATE_KEY")

if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  SESSION_NAME="anvil-smoke"
  tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null || \
    tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "$PWD" -- "${SHELL:-zsh}" -l
  tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" "anvil --port 18545" C-m
  sleep 1
fi

cast rpc anvil_setBalance "$FROM" 0x3635C9ADC5DEA00000 --rpc-url "$RPC_URL" >/dev/null

MOCK_ADDR=$(forge create --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --json contracts/staking/stakeManager/RootStakeStateSyncHarness.sol:MockStateSenderHarness | jq -r '.deployedTo')
HARNESS_ADDR=$(forge create --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --json contracts/staking/stakeManager/RootStakeStateSyncHarness.sol:RootStakeStateSyncHarness | jq -r '.deployedTo')

ENCODED=$(cast call "$HARNESS_ADDR" "$encode_sig" \
  "$VALIDATOR_ID" "$SIGNER" "$AMOUNT" "$NONCE" "$STATUS" --rpc-url "$RPC_URL")
ENCODED_RAW="0x${ENCODED:130}"
if [[ "$ENCODED_RAW" != "$EXPECTED_PAYLOAD" ]]; then
  echo "encode mismatch"
  echo " got: $ENCODED_RAW"
  echo "want: $EXPECTED_PAYLOAD"
  exit 1
fi
echo "PASS encodePayload matches Wave 2D abi.encode layout"

cast send "$MOCK_ADDR" "$register_sig" "$HARNESS_ADDR" "$CHILD_HUB" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null

TX_HASH=$(cast send "$HARNESS_ADDR" "$sync_sig" \
  "$MOCK_ADDR" "$CHILD_HUB" "$VALIDATOR_ID" "$SIGNER" "$AMOUNT" "$NONCE" "$STATUS" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --json | jq -r '.transactionHash')

COUNTER=$(cast call "$MOCK_ADDR" "counter()(uint256)" --rpc-url "$RPC_URL")
if [[ "$COUNTER" != "1" ]]; then
  echo "FAIL expected StateSender counter=1 got $COUNTER"
  exit 1
fi

STATE_SYNCED_TOPIC=0x103fed9db65eac19c4d870f49ab7520fe03b99f1838e5996caf47e9e43308392
LOG_DATA=$(cast receipt "$TX_HASH" --rpc-url "$RPC_URL" --json | \
  jq -r --arg topic "$STATE_SYNCED_TOPIC" '.logs[] | select(.topics[0]==$topic) | .data')
LOG_DATA_RAW="0x${LOG_DATA:130}"
if [[ "$LOG_DATA_RAW" != "$EXPECTED_PAYLOAD" ]]; then
  echo "FAIL StateSynced payload mismatch"
  echo " got: $LOG_DATA_RAW"
  echo "want: $EXPECTED_PAYLOAD"
  exit 1
fi

echo "PASS syncPayload emitted StateSynced with Wave 2D payload"
echo "ALL TESTS PASSED"
