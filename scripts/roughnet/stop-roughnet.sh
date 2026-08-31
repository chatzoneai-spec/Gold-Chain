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

stop_pid_file geth "$ROUGHNET/geth.pid"
stop_pid_file giltconsd "$ROUGHNET/giltconsd.pid"
