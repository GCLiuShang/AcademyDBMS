#!/bin/sh
# ============================================================================
# wait-for-it.sh - 等待TCP服务就绪的脚本
# 用法: ./wait-for-it.sh host:port [-t timeout] [-- command args]
# 示例: ./wait-for-it.sh db:3306 -t 30 -- node index.js
# ============================================================================

set -e

TIMEOUT=30
QUIET=0
HOST=""
WAIT_PORT=""
CMD=""

usage() {
  echo "Usage: $0 host:port [-t timeout] [-- command args]"
  exit 1
}

# 解析参数
while [ $# -gt 0 ]; do
  case "$1" in
    *:* )
      HOST=$(echo "$1" | cut -d: -f1)
      WAIT_PORT=$(echo "$1" | cut -d: -f2)
      shift 1
      ;;
    -t )
      TIMEOUT="$2"
      if [ -z "$TIMEOUT" ]; then usage; fi
      shift 2
      ;;
    -- )
      shift
      CMD="$@"
      break
      ;;
    -q )
      QUIET=1
      shift 1
      ;;
    * )
      usage
      ;;
  esac
done

if [ -z "$HOST" ] || [ -z "$WAIT_PORT" ]; then
  usage
fi

# 等待服务就绪
echo "Waiting for $HOST:$WAIT_PORT (timeout: ${TIMEOUT}s)..."

start_ts=$(date +%s)
while true; do
  if nc -z "$HOST" "$WAIT_PORT" 2>/dev/null; then
    end_ts=$(date +%s)
    elapsed=$((end_ts - start_ts))
    echo "$HOST:$WAIT_PORT is available after ${elapsed}s"
    break
  fi
  sleep 1
  now_ts=$(date +%s)
  elapsed=$((now_ts - start_ts))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "ERROR: Timeout after ${TIMEOUT}s waiting for $HOST:$WAIT_PORT"
    exit 1
  fi
done

# 执行命令
if [ -n "$CMD" ]; then
  exec $CMD
fi