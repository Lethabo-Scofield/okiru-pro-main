#!/bin/bash

API_PID=""
WEB_PID=""

cleanup() {
  if [ -n "$API_PID" ]; then kill $API_PID 2>/dev/null; fi
  if [ -n "$WEB_PID" ]; then kill $WEB_PID 2>/dev/null; fi
  wait $API_PID $WEB_PID 2>/dev/null
}
trap cleanup EXIT SIGTERM SIGINT

export API_PORT="${API_PORT:-3000}"
export PORT="${PORT:-5000}"

cd /home/runner/workspace/apps/api
NODE_ENV=production PORT=$API_PORT node dist/index.cjs &
API_PID=$!

cd /home/runner/workspace/apps/web
NODE_ENV=production PORT=$PORT node dist/index.cjs &
WEB_PID=$!

wait -n $API_PID $WEB_PID 2>/dev/null
EXIT_CODE=$?
exit $EXIT_CODE
