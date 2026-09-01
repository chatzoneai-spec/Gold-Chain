#!/usr/bin/env bash
set -euo pipefail

ROUGHNET="/workspace/.tmp/roughnet"

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ ! -f "$pid_file" ]]; then
    echo "$name: no pid file at $pid_file"
    return 0
  fi
  local pid
  pid=$(cat "$pid_file")
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$name: pid $pid not running"
    rm -f "$pid_file"
    return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "$name: stopped pid $pid"
      return 0
    fi
    sleep 1
  done
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$pid_file"
  echo "$name: killed pid $pid"
}

stop_giltconsd_only() {
  for idx in 0 1 2 3; do
    stop_pid_file "giltconsd-node${idx}" "$ROUGHNET/giltconsd-node${idx}.pid"
  done
  stop_pid_file giltconsd "$ROUGHNET/giltconsd.pid"
}

if [[ "${1:-}" == "--giltconsd-only" ]]; then
  stop_giltconsd_only
  exit 0
fi

stop_pid_file geth "$ROUGHNET/geth.pid"
stop_giltconsd_only
