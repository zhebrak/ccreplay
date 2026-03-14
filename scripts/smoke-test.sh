#!/usr/bin/env bash
set -euo pipefail

# Smoke test: renders test videos with various configurations and validates output
# Usage: scripts/smoke-test.sh [session-path]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$ROOT_DIR/test-output"
CCREPLAY="node $ROOT_DIR/dist/cli.js"
PASS=0
FAIL=0
SKIP=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { PASS=$((PASS + 1)); printf "  ${GREEN}PASS${RESET}  %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ${RED}FAIL${RESET}  %s — %s\n" "$1" "$2"; }
skip() { SKIP=$((SKIP + 1)); printf "  ${YELLOW}SKIP${RESET}  %s — %s\n" "$1" "$2"; }

# Check for ffprobe
HAS_FFPROBE=false
if command -v ffprobe &>/dev/null; then
  HAS_FFPROBE=true
fi

# Validate video file: exists, size > 10KB, optionally check resolution/codec via ffprobe
validate_video() {
  local file="$1"
  local label="$2"
  local expected_w="${3:-}"
  local expected_h="${4:-}"
  local expected_fps="${5:-}"

  if [[ ! -f "$file" ]]; then
    fail "$label" "file not created"
    return
  fi

  local size
  size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
  if [[ "$size" -lt 10240 ]]; then
    fail "$label" "file too small (${size} bytes)"
    return
  fi

  if [[ "$HAS_FFPROBE" == "true" && -n "$expected_w" ]]; then
    local probe
    probe=$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=codec_name,width,height,r_frame_rate \
      -of csv=p=0 "$file" 2>/dev/null) || true

    if [[ -z "$probe" ]]; then
      fail "$label" "ffprobe failed"
      return
    fi

    local codec width height fps_raw
    IFS=',' read -r codec width height fps_raw <<< "$probe"

    if [[ "$codec" != "h264" ]]; then
      fail "$label" "codec=$codec, expected h264"
      return
    fi
    if [[ "$width" != "$expected_w" || "$height" != "$expected_h" ]]; then
      fail "$label" "resolution=${width}x${height}, expected ${expected_w}x${expected_h}"
      return
    fi
    if [[ -n "$expected_fps" ]]; then
      # fps_raw is like "60/1" or "30/1"
      local fps_num
      fps_num=$(echo "$fps_raw" | cut -d'/' -f1)
      if [[ "$fps_num" != "$expected_fps" ]]; then
        fail "$label" "fps=$fps_num, expected $expected_fps"
        return
      fi
    fi
  fi

  local size_kb=$((size / 1024))
  pass "$label ${DIM}(${size_kb}KB)${RESET}"
}

# Find a session file
SESSION="${1:-}"
if [[ -z "$SESSION" ]]; then
  SESSION=$(find ~/.claude/projects/ -name "*.jsonl" -size +1k 2>/dev/null | head -1) || true
fi
if [[ -z "$SESSION" || ! -f "$SESSION" ]]; then
  echo -e "${RED}No session file found. Pass a path: scripts/smoke-test.sh <session.jsonl>${RESET}"
  exit 1
fi

echo -e "\n${BOLD}ccreplay smoke test${RESET}"
echo -e "  Session: ${DIM}$SESSION${RESET}\n"

# Build first
echo -e "${BOLD}Building...${RESET}"
cd "$ROOT_DIR"
npm run build --silent 2>&1
echo ""

# Create output dir
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# ─── Render test videos ───────────────────────────────────────────────

echo -e "${BOLD}Rendering test videos (8s each)...${RESET}\n"

# Helper: render and validate a video
render_and_validate() {
  local label="$1"
  local outfile="$2"
  local expected_w="$3"
  local expected_h="$4"
  local expected_fps="${5:-}"
  shift 4; [[ -n "${expected_fps:-}" ]] && shift
  # remaining args are ccreplay flags (before session)
  if $CCREPLAY "$@" -o "$outfile" "$SESSION" 2>&1; then
    validate_video "$outfile" "$label" "$expected_w" "$expected_h" "$expected_fps"
  else
    fail "$label" "render failed"
  fi
}

# Default settings
render_and_validate "default" "$OUT_DIR/default.mp4" "1920" "1080" "" -d 8

# Themes
for theme in dracula monokai solarized-dark light; do
  render_and_validate "theme: $theme" "$OUT_DIR/theme-${theme}.mp4" "1920" "1080" "" -d 8 --theme "$theme"
done

# Resolutions
render_and_validate "resolution: 720p" "$OUT_DIR/res-720p.mp4" "1280" "720" "" -d 8 -r 720p
render_and_validate "resolution: 4k" "$OUT_DIR/res-4k.mp4" "3840" "2160" "" -d 8 -r 4k

# Font sizes
render_and_validate "font-size: 24" "$OUT_DIR/font-24.mp4" "1920" "1080" "" -d 8 --font-size 24
render_and_validate "font-size: 12" "$OUT_DIR/font-12.mp4" "1920" "1080" "" -d 8 --font-size 12

# Font presets
render_and_validate "font: fira-code" "$OUT_DIR/font-fira-code.mp4" "1920" "1080" "" -d 8 --font fira-code
render_and_validate "font: source-code-pro" "$OUT_DIR/font-source-code-pro.mp4" "1920" "1080" "" -d 8 --font source-code-pro

# ─── Spec compliance checks ──────────────────────────────────────────

echo -e "\n${BOLD}Spec compliance checks...${RESET}\n"

# Custom WxH resolution
render_and_validate "--resolution WxH format" "$OUT_DIR/res-custom.mp4" "1600" "900" "" -d 8 -r 1600x900

# Custom fps
render_and_validate "--fps 30" "$OUT_DIR/fps-30.mp4" "1920" "1080" "30" -d 8 --fps 30

# Custom font file path (use bundled JBMono)
render_and_validate "--font custom path" "$OUT_DIR/font-custom-path.mp4" "1920" "1080" "" -d 8 --font "$ROOT_DIR/fonts/JetBrainsMono-Regular.ttf"

# Custom bold font path
render_and_validate "--font-bold custom path" "$OUT_DIR/font-custom-bold.mp4" "1920" "1080" "" -d 8 --font-bold "$ROOT_DIR/fonts/JetBrainsMono-Bold.ttf"

# --config flag
TMPCONFIG=$(mktemp /tmp/ccreplay-cfg-XXXXX.json)
echo '{"theme":"dracula","video":{"fps":30}}' > "$TMPCONFIG"
render_and_validate "--config flag" "$OUT_DIR/config-file.mp4" "1920" "1080" "30" -d 8 -c "$TMPCONFIG"

# Precedence: config file < CLI (config=dracula, CLI=monokai)
echo '{"theme":"dracula"}' > "$TMPCONFIG"
render_and_validate "precedence: config < CLI" "$OUT_DIR/precedence.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG" --theme monokai
rm -f "$TMPCONFIG"

# --init flag
TMPDIR_INIT=$(mktemp -d /tmp/ccreplay-init-XXXXX)
cd "$TMPDIR_INIT"
$CCREPLAY --init 2>&1
if [[ -f "ccreplay.config.json" ]]; then
  pass "--init creates config file"
else
  fail "--init creates config file" "file not created"
fi
rm -rf "$TMPDIR_INIT"
cd "$ROOT_DIR"

# Even dimension validation (odd should fail)
if $CCREPLAY -d 8 -r 1921x1080 -o /dev/null "$SESSION" 2>&1; then
  fail "even dimension validation" "odd width did not error"
else
  pass "even dimension validation"
fi

# --help includes all new flags
HELP_OUTPUT=$($CCREPLAY --help 2>&1)
HELP_OK=true
for flag in "--font-size" "--font " "--font-bold" "--theme" "--resolution" "--fps" "--config" "--init" "--version"; do
  if ! echo "$HELP_OUTPUT" | grep -q -- "$flag"; then
    fail "--help completeness" "missing: $flag"
    HELP_OK=false
    break
  fi
done
if [[ "$HELP_OK" == "true" ]]; then
  pass "--help includes all flags"
fi

# --version
VERSION_OUTPUT=$($CCREPLAY --version 2>&1)
if echo "$VERSION_OUTPUT" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  pass "--version output: $VERSION_OUTPUT"
else
  fail "--version" "unexpected output: $VERSION_OUTPUT"
fi

# ─── Config JSON validation ───────────────────────────────────────────

echo -e "\n${BOLD}Config JSON smoke tests...${RESET}\n"

TMPCONFIG=$(mktemp /tmp/ccreplay-cfg-XXXXX.json)

# S1: crf=18
echo '{"video":{"crf":18}}' > "$TMPCONFIG"
render_and_validate "config: crf=18" "$OUT_DIR/cfg-crf18.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S2: preset=medium
echo '{"video":{"preset":"medium"}}' > "$TMPCONFIG"
render_and_validate "config: preset=medium" "$OUT_DIR/cfg-preset.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S3: timing overrides
echo '{"timing":{"introDuration":2,"outroDuration":3,"lingerDuration":1,"scrollSpeed":0.3}}' > "$TMPCONFIG"
render_and_validate "config: timing" "$OUT_DIR/cfg-timing.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S4: custom colors
cat > "$TMPCONFIG" <<'ENDJSON'
{"colors":{"accent":"#ff0000","background":"#000033","text":"#eeeeff","titleBarBg":"#111133","statusBarBg":"#0a0a22","gradientStart":"#000022"}}
ENDJSON
render_and_validate "config: custom colors" "$OUT_DIR/cfg-colors.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S5: ANSI + syntax colors
cat > "$TMPCONFIG" <<'ENDJSON'
{"ansiColors":{"red":"#ff4444","green":"#44ff44","blue":"#4444ff"},"syntaxColors":{"keyword":"#ff00ff","string":"#00ffff"}}
ENDJSON
render_and_validate "config: ANSI+syntax" "$OUT_DIR/cfg-ansi-syntax.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S6: font paths (use bundled FiraCode)
cat > "$TMPCONFIG" <<ENDJSON
{"font":{"regularPath":"$ROOT_DIR/fonts/FiraCode-Regular.ttf","boldPath":"$ROOT_DIR/fonts/FiraCode-Bold.ttf"}}
ENDJSON
render_and_validate "config: font paths" "$OUT_DIR/cfg-font-paths.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S7: window config
echo '{"window":{"controls":false,"outerPadding":60,"innerPadding":20,"radius":24}}' > "$TMPCONFIG"
render_and_validate "config: window" "$OUT_DIR/cfg-window.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S8: empty JSON
echo '{}' > "$TMPCONFIG"
render_and_validate "config: empty JSON" "$OUT_DIR/cfg-empty.mp4" "1920" "1080" "" -d 8 -c "$TMPCONFIG"

# S9: kitchen sink (all 7 sections)
cat > "$TMPCONFIG" <<ENDJSON
{
  "theme":"dracula",
  "colors":{"accent":"#ff6600","background":"#1a1a2e"},
  "ansiColors":{"red":"#ff3333"},
  "syntaxColors":{"keyword":"#cc44cc"},
  "font":{"preset":"fira-code","size":20},
  "video":{"width":1280,"height":720,"fps":30,"crf":20,"preset":"fast"},
  "timing":{"introDuration":1,"outroDuration":1,"lingerDuration":1,"scrollSpeed":0.2},
  "window":{"controls":true,"outerPadding":30,"innerPadding":24,"radius":12}
}
ENDJSON
render_and_validate "config: kitchen sink" "$OUT_DIR/cfg-kitchen-sink.mp4" "1280" "720" "30" -d 8 -c "$TMPCONFIG"

# S10: malformed JSON (should fail)
echo '{ invalid json }' > "$TMPCONFIG"
if $CCREPLAY -d 8 -c "$TMPCONFIG" -o /dev/null "$SESSION" 2>&1; then
  fail "config: malformed JSON" "should have exited non-zero"
else
  pass "config: malformed JSON (rejected)"
fi

# S11: resolution 320x240
render_and_validate "config: 320x240" "$OUT_DIR/cfg-320x240.mp4" "320" "240" "" -d 8 -r 320x240

# S12: precedence: theme+config+CLI (config fps:30, CLI --fps 60)
echo '{"theme":"dracula","video":{"fps":30}}' > "$TMPCONFIG"
render_and_validate "precedence: config+CLI" "$OUT_DIR/cfg-precedence.mp4" "1920" "1080" "60" -d 8 -c "$TMPCONFIG" --fps 60

rm -f "$TMPCONFIG"

# ─── Summary ─────────────────────────────────────────────────────────

echo ""
TOTAL=$((PASS + FAIL + SKIP))
echo -e "${BOLD}Results: ${GREEN}${PASS} passed${RESET}, ${RED}${FAIL} failed${RESET}, ${YELLOW}${SKIP} skipped${RESET} / ${TOTAL} total"

if [[ "$HAS_FFPROBE" != "true" ]]; then
  echo -e "${YELLOW}Note: ffprobe not found — resolution/codec checks skipped${RESET}"
fi

echo -e "\nTest videos in: ${DIM}${OUT_DIR}/${RESET}\n"

[[ "$FAIL" -eq 0 ]]
