#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MCP_TEST_BASE_URL:-}"
if [[ -z "$BASE_URL" ]]; then
  PORT_VALUE="${PORT:-${MCP_PORT:-3000}}"
  BASE_URL="http://127.0.0.1:${PORT_VALUE}"
fi
BASE_URL="${BASE_URL%/}"
MCP_URL="${MCP_TEST_MCP_URL:-${BASE_URL}/mcp}"
MAX_BODY_LINES="${MCP_TEST_MAX_BODY_LINES:-40}"
MAX_BODY_BYTES="${MCP_TEST_MAX_BODY_BYTES:-4000}"

print_body_preview() {
  local file_path="$1"
  local line_count
  local byte_count
  line_count="$(wc -l <"$file_path" | tr -d ' ')"
  byte_count="$(wc -c <"$file_path" | tr -d ' ')"

  if [[ "$byte_count" -gt "$MAX_BODY_BYTES" ]]; then
    head -c "$MAX_BODY_BYTES" "$file_path"
    echo
    echo "... (truncated: ${byte_count} bytes total)"
    return
  fi

  if [[ "$line_count" -gt "$MAX_BODY_LINES" ]]; then
    sed -n "1,${MAX_BODY_LINES}p" "$file_path"
    echo "... (truncated: ${line_count} lines total)"
  else
    cat "$file_path"
  fi
}

AUTH_HEADER=""
if [[ -n "${MCP_TEST_AUTH_HEADER:-}" ]]; then
  AUTH_HEADER="${MCP_TEST_AUTH_HEADER}"
elif [[ -n "${MCP_TEST_BEARER_TOKEN:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer ${MCP_TEST_BEARER_TOKEN}"
elif [[ "${MCP_AUTH_MODE:-}" == "bearer" && -n "${MCP_AUTH_TOKEN:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer ${MCP_AUTH_TOKEN}"
fi

echo "MCP HTTP Test"
echo "  base URL: ${BASE_URL}"
echo "  MCP URL:  ${MCP_URL}"

echo
echo "Health checks"
curl -fsS "${BASE_URL}/health" >/dev/null
echo "  /health: ok"
curl -fsS "${BASE_URL}/ready" >/dev/null
echo "  /ready:  ok"

INIT_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"local-http-test","version":"0.1.0"}}}'
LIST_TOOLS_PAYLOAD='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

INIT_HEADERS="$(mktemp)"
INIT_BODY="$(mktemp)"
TOOLS_HEADERS="$(mktemp)"
TOOLS_BODY="$(mktemp)"
trap 'rm -f "$INIT_HEADERS" "$INIT_BODY" "$TOOLS_HEADERS" "$TOOLS_BODY"' EXIT

echo
echo "Initialize"
if [[ -n "$AUTH_HEADER" ]]; then
  INIT_STATUS="$(curl -sS -o "$INIT_BODY" -D "$INIT_HEADERS" -w "%{http_code}" \
    -X POST "${MCP_URL}" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    --data "${INIT_PAYLOAD}")"
else
  INIT_STATUS="$(curl -sS -o "$INIT_BODY" -D "$INIT_HEADERS" -w "%{http_code}" \
    -X POST "${MCP_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    --data "${INIT_PAYLOAD}")"
fi
echo "  status: ${INIT_STATUS}"
print_body_preview "$INIT_BODY"
echo

SESSION_ID="$(awk 'tolower($1)=="mcp-session-id:" {print $2}' "$INIT_HEADERS" | tr -d '\r' || true)"
SESSION_HEADER=""
if [[ -n "$SESSION_ID" ]]; then
  SESSION_HEADER="Mcp-Session-Id: ${SESSION_ID}"
  echo "  session: ${SESSION_ID}"
else
  echo "  session: none (stateless mode or server omitted header)"
fi

echo
echo "tools/list"
if [[ -n "$AUTH_HEADER" && -n "$SESSION_HEADER" ]]; then
  TOOLS_STATUS="$(curl -sS -o "$TOOLS_BODY" -D "$TOOLS_HEADERS" -w "%{http_code}" \
    -X POST "${MCP_URL}" \
    -H "$AUTH_HEADER" \
    -H "$SESSION_HEADER" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    --data "${LIST_TOOLS_PAYLOAD}")"
elif [[ -n "$AUTH_HEADER" ]]; then
  TOOLS_STATUS="$(curl -sS -o "$TOOLS_BODY" -D "$TOOLS_HEADERS" -w "%{http_code}" \
    -X POST "${MCP_URL}" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    --data "${LIST_TOOLS_PAYLOAD}")"
elif [[ -n "$SESSION_HEADER" ]]; then
  TOOLS_STATUS="$(curl -sS -o "$TOOLS_BODY" -D "$TOOLS_HEADERS" -w "%{http_code}" \
    -X POST "${MCP_URL}" \
    -H "$SESSION_HEADER" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    --data "${LIST_TOOLS_PAYLOAD}")"
else
  TOOLS_STATUS="$(curl -sS -o "$TOOLS_BODY" -D "$TOOLS_HEADERS" -w "%{http_code}" \
    -X POST "${MCP_URL}" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    --data "${LIST_TOOLS_PAYLOAD}")"
fi
echo "  status: ${TOOLS_STATUS}"
print_body_preview "$TOOLS_BODY"
echo

if [[ "$INIT_STATUS" -ge 400 || "$TOOLS_STATUS" -ge 400 ]]; then
  echo "MCP HTTP test failed"
  exit 1
fi

echo "MCP HTTP test passed"
