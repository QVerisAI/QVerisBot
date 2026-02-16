#!/usr/bin/env bash
# Test npm pack + install flow locally or in Docker.
# Run before major changes (upstream merge, major features) to verify the published package works.
#
# Usage:
#   ./scripts/test-npm-pack-smoke.sh           # local quick test
#   ./scripts/test-npm-pack-smoke.sh --docker  # Docker isolated test (no -it for CI)
#
# Env:
#   SKIP_BUILD=1              skip build+pack, use existing tarball
#   KEEP_TESTDIR=1            keep test dir on exit (for debugging)
#   QVERISBOT_SMOKE_AGENT=1   run onboard + agent test (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_DOCKER=false
for arg in "$@"; do
  [[ "$arg" == "--docker" ]] && USE_DOCKER=true && break
done

# Resolve tarball path (npm pack: @scope/pkg -> scope-pkg-version.tgz)
PKG_NAME="$(node -p "require('./package.json').name")"
PKG_VERSION="$(node -p "require('./package.json').version")"
TARBALL_NAME="$(node -p "const p=require('./package.json'); p.name.replace(/@/,'').replace(/\\//,'-')+'-'+p.version+'.tgz'")"
TARBALL_PATH="$ROOT_DIR/$TARBALL_NAME"

TESTDIR=""
ONBOARD_HOME=""
GATEWAY_PID=""
cleanup() {
  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
  if [[ -n "$ONBOARD_HOME" && -d "$ONBOARD_HOME" && "${KEEP_TESTDIR:-0}" != "1" ]]; then
    rm -rf "$ONBOARD_HOME"
  fi
  if [[ -n "$TESTDIR" && -d "$TESTDIR" && "${KEEP_TESTDIR:-0}" != "1" ]]; then
    echo "==> Cleanup: remove $TESTDIR"
    rm -rf "$TESTDIR"
  fi
}
trap cleanup EXIT

echo "==> QVerisBot npm pack smoke test"
echo "    Package: $PKG_NAME@$PKG_VERSION"
echo "    Mode: $([ "$USE_DOCKER" = true ] && echo "Docker" || echo "Local")"
echo ""

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> 1. Build and pack"
  pnpm build
  pnpm ui:build
  pnpm pack
  echo ""
else
  echo "==> 1. Skip build (SKIP_BUILD=1)"
  if [[ ! -f "$TARBALL_PATH" ]]; then
    echo "ERROR: Tarball not found: $TARBALL_PATH" >&2
    exit 1
  fi
  echo "    Using: $TARBALL_PATH"
  echo ""
fi

if [[ "$USE_DOCKER" = true ]]; then
  echo "==> 2. Docker isolated test"
  DOCKER_EXTRA=()
  [[ -n "${ANTHROPIC_API_KEY:-}" ]] && DOCKER_EXTRA+=(-e ANTHROPIC_API_KEY)
  [[ -n "${OPENAI_API_KEY:-}" ]] && DOCKER_EXTRA+=(-e OPENAI_API_KEY)
  [[ "${QVERISBOT_SMOKE_AGENT:-0}" == "1" ]] && DOCKER_EXTRA+=(-e QVERISBOT_SMOKE_AGENT=1)

  docker run --rm \
    -v "$TARBALL_PATH:/tmp/pkg.tgz" \
    "${DOCKER_EXTRA[@]}" \
    node:22 bash -c '
      set -euo pipefail
      echo "Install tarball..."
      npm install -g /tmp/pkg.tgz 2>/dev/null

      GLOBAL_ROOT="$(npm root -g)"
      PKG_DIR="$GLOBAL_ROOT/@qverisai/qverisbot"

      echo ""
      echo "=== File structure ==="
      echo "dist/plugin-sdk:     $(test -d "$PKG_DIR/dist/plugin-sdk" && echo OK || echo MISSING)"
      echo "dist/plugin-sdk.js:  $(test -f "$PKG_DIR/dist/plugin-sdk/index.js" && echo OK || echo MISSING)"
      echo "src/ (must be absent): $(test -d "$PKG_DIR/src" && echo PRESENT-BAD || echo absent-OK)"
      echo "extensions/x/:      $(test -d "$PKG_DIR/extensions/x" && echo OK || echo MISSING)"

      echo ""
      echo "=== CLI version ==="
      qverisbot --version

      echo ""
      echo "=== Plugin loading (doctor) ==="
      out=$(qverisbot doctor 2>&1) || true
      echo "$out" | head -80
      if echo "$out" | grep -q "Errors: 0" && echo "$out" | grep -q "Loaded:"; then
        echo ""
        echo "PASS: Plugins loaded with 0 errors"
      else
        echo ""
        echo "WARN: Check doctor output for plugin errors"
      fi

      echo ""
      echo "=== Onboard test (non-interactive) ==="
      ONBOARD_HOME=$(mktemp -d)
      export HOME="$ONBOARD_HOME"
      qverisbot onboard --non-interactive --accept-risk --flow quickstart --mode local \
        --auth-choice skip \
        --skip-channels --skip-skills --skip-daemon --skip-ui --skip-health 2>/dev/null || true
      if [[ ! -f "$HOME/.openclaw/openclaw.json" ]]; then
        echo "FAIL: onboard config not created"
        exit 1
      fi
      echo "PASS: onboard config created"
      rm -rf "$ONBOARD_HOME"
      unset HOME

      if [[ "${QVERISBOT_SMOKE_AGENT:-0}" == "1" ]]; then
        echo ""
        echo "=== Agent test ==="
        if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
          AUTH_FLAGS="--auth-choice anthropic --anthropic-api-key $ANTHROPIC_API_KEY"
        elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
          AUTH_FLAGS="--auth-choice openai --openai-api-key $OPENAI_API_KEY"
        else
          echo "SKIP: ANTHROPIC_API_KEY or OPENAI_API_KEY not set"
        fi
        if [[ -n "${AUTH_FLAGS:-}" ]]; then
          ONBOARD_HOME=$(mktemp -d)
          export HOME="$ONBOARD_HOME"
          qverisbot onboard --non-interactive --accept-risk --flow quickstart --mode local \
            $AUTH_FLAGS \
            --skip-channels --skip-skills --skip-daemon --skip-ui --skip-health 2>/dev/null || true
          qverisbot gateway --port 18789 --bind loopback --allow-unconfigured > /tmp/gw.log 2>&1 &
          GW_PID=$!
          for i in $(seq 1 30); do
            if node -e "
              const net=require(\"net\");
              const s=net.createConnection(18789,\"127.0.0.1\");
              s.on(\"connect\",()=>{s.end();process.exit(0);});
              s.on(\"error\",()=>process.exit(1));
              setTimeout(()=>process.exit(1),2000);
            " 2>/dev/null; then break; fi
            [[ $i -eq 30 ]] && { echo "FAIL: gateway did not start"; exit 1; }
            sleep 1
          done
          agent_out=$(qverisbot agent --message "Reply with exactly: OK" --session-id "smoke-$(date +%s)" --agent main --thinking off 2>&1) || true
          kill $GW_PID 2>/dev/null || true
          if echo "$agent_out" | grep -qE "OK|ok"; then
            echo "PASS: Agent replied"
          else
            echo "WARN: Agent output:"
            echo "$agent_out" | head -10
          fi
          rm -rf "$ONBOARD_HOME"
        fi
      fi
    '
  echo ""
  echo "==> Docker smoke test completed"
  exit 0
fi

# --- Local mode ---
echo "==> 2. Create isolated test dir"
TESTDIR=$(mktemp -d)
echo "    $TESTDIR"
echo ""

echo "==> 3. Local install (simulate user npm install)"
cd "$TESTDIR"
npm init -y
npm install "$TARBALL_PATH" 2>/dev/null
echo ""

echo "==> 4. Verify file structure (local install)"
PKG_DIR="$TESTDIR/node_modules/@qverisai/qverisbot"
check() {
  local path="$1"
  local expect="$2"
  local actual
  if [[ -e "$path" ]]; then actual="exists"; else actual="missing"; fi
  if [[ "$expect" == "exists" && "$actual" == "exists" ]]; then
    echo "    OK   $path"
    return 0
  fi
  if [[ "$expect" == "absent" && "$actual" == "missing" ]]; then
    echo "    OK   $path (absent as expected)"
    return 0
  fi
  echo "    FAIL $path (expected: $expect, got: $actual)" >&2
  return 1
}
check "$PKG_DIR/dist/plugin-sdk" "exists"
check "$PKG_DIR/dist/plugin-sdk/index.js" "exists"
check "$PKG_DIR/src" "absent"
check "$PKG_DIR/extensions/x" "exists"
echo ""

echo "==> 5. Global install and CLI verification"
npm install -g "$TARBALL_PATH" 2>/dev/null
echo ""

QVERISBOT_CMD=()
if command -v qverisbot >/dev/null 2>&1; then
  QVERISBOT_CMD=(qverisbot)
else
  NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"
  NPM_ROOT="$(npm root -g 2>/dev/null || true)"
  if [[ -n "$NPM_PREFIX" && -x "$NPM_PREFIX/bin/qverisbot" ]]; then
    QVERISBOT_CMD=("$NPM_PREFIX/bin/qverisbot")
  elif [[ -n "$NPM_PREFIX" && -x "$NPM_PREFIX/bin/openclaw" ]]; then
    QVERISBOT_CMD=("$NPM_PREFIX/bin/openclaw")
  elif [[ -n "$NPM_ROOT" && -f "$NPM_ROOT/@qverisai/qverisbot/openclaw.mjs" ]]; then
    QVERISBOT_CMD=(node "$NPM_ROOT/@qverisai/qverisbot/openclaw.mjs")
  else
    echo "    FAIL: qverisbot CLI not found after global install" >&2
    echo "    npm prefix -g: ${NPM_PREFIX:-<empty>}" >&2
    echo "    npm root -g:   ${NPM_ROOT:-<empty>}" >&2
    exit 1
  fi
fi

echo "    CLI resolved to: ${QVERISBOT_CMD[*]}"
echo "    Version: $("${QVERISBOT_CMD[@]}" --version)"
echo ""

echo "    Doctor (plugin load check):"
doctor_out=$("${QVERISBOT_CMD[@]}" doctor 2>&1) || true
echo "$doctor_out" | grep -E "^(◇|│|├|└|  )" | head -50 || true
if echo "$doctor_out" | grep -q "Errors: 0" && echo "$doctor_out" | grep -q "Loaded:"; then
  echo "    PASS: Plugins loaded with 0 errors"
else
  echo "    WARN: Check doctor output for plugin errors"
fi
echo ""

# --- Onboard test (always) ---
echo "==> 5b. Onboard test (non-interactive)"
ONBOARD_HOME=$(mktemp -d)
export HOME="$ONBOARD_HOME"
"${QVERISBOT_CMD[@]}" onboard --non-interactive --accept-risk --flow quickstart --mode local \
  --auth-choice skip \
  --skip-channels --skip-skills --skip-daemon --skip-ui --skip-health \
  2>/dev/null || true

if [[ ! -f "$HOME/.openclaw/openclaw.json" ]]; then
  echo "    FAIL: Config not created" >&2
  exit 1
fi
echo "    OK   Config created"
rm -rf "$ONBOARD_HOME"
unset HOME
echo ""

# --- Agent test (optional, requires API key) ---
if [[ "${QVERISBOT_SMOKE_AGENT:-0}" == "1" ]]; then
  echo "==> 5c. Agent test (QVERISBOT_SMOKE_AGENT=1)"
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    AUTH_FLAGS="--auth-choice anthropic --anthropic-api-key $ANTHROPIC_API_KEY"
  elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
    AUTH_FLAGS="--auth-choice openai --openai-api-key $OPENAI_API_KEY"
  else
    echo "    SKIP: Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run agent test"
  fi

  if [[ -n "${AUTH_FLAGS:-}" ]]; then
    ONBOARD_HOME=$(mktemp -d)
    export HOME="$ONBOARD_HOME"
    echo "    Onboard with auth (temp HOME)..."

    "${QVERISBOT_CMD[@]}" onboard --non-interactive --accept-risk --flow quickstart --mode local \
      $AUTH_FLAGS \
      --skip-channels --skip-skills --skip-daemon --skip-ui --skip-health \
      2>/dev/null || true

    if [[ ! -f "$HOME/.openclaw/openclaw.json" ]]; then
      echo "    FAIL: Config not created" >&2
      exit 1
    fi
    echo "    OK   Config created"

    echo "    Starting gateway..."
    "${QVERISBOT_CMD[@]}" gateway --port 18789 --bind loopback --allow-unconfigured > /tmp/qverisbot-smoke-gateway.log 2>&1 &
    GATEWAY_PID=$!

    echo "    Waiting for gateway..."
    for i in $(seq 1 30); do
      if node -e "
        const net=require('net');
        const s=net.createConnection(18789,'127.0.0.1');
        s.on('connect',()=>{s.end();process.exit(0);});
        s.on('error',()=>process.exit(1));
        setTimeout(()=>process.exit(1),2000);
      " 2>/dev/null; then
        break
      fi
      if [[ $i -eq 30 ]]; then
        echo "    FAIL: Gateway did not start" >&2
        tail -20 /tmp/qverisbot-smoke-gateway.log >&2
        exit 1
      fi
      sleep 1
    done
    echo "    OK   Gateway ready"

    SESSION_ID="smoke-test-$(date +%s)"
    echo "    Sending agent message (session: $SESSION_ID)..."
    agent_out=$("${QVERISBOT_CMD[@]}" agent --message "Reply with exactly: OK" --session-id "$SESSION_ID" --agent main --thinking off 2>&1) || true

    if echo "$agent_out" | grep -qE "OK|ok"; then
      echo "    PASS: Agent replied"
    else
      echo "    WARN: Agent output (may have failed):"
      echo "$agent_out" | head -15 | sed 's/^/      /'
    fi

    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
    GATEWAY_PID=""
    unset HOME
  fi
  echo ""
fi

echo "==> 6. Cleanup global install"
npm uninstall -g @qverisai/qverisbot 2>/dev/null || true
echo ""

echo "==> Local smoke test completed"
