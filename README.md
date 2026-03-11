# ccreplay

[![CI](https://github.com/zhebrak/ccreplay/actions/workflows/ci.yml/badge.svg)](https://github.com/zhebrak/ccreplay/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@zhebrak/ccreplay.svg)](https://www.npmjs.com/package/@zhebrak/ccreplay)

Terminal replay videos of Claude Code sessions. Turns JSONL session logs into polished MP4 videos with syntax highlighting, tool call visualization, and smooth scrolling.

<video src="https://github.com/user-attachments/assets/82c5f71b-4f40-4110-a00d-9bc48d22d9ab" width="320" height="240" controls autoplay loop muted playsinline></video>


## Install

```bash
npm install -g @zhebrak/ccreplay
```

Or run directly:

```bash
npx @zhebrak/ccreplay
```

### Prerequisites

- **Node.js** >= 22

ffmpeg is bundled automatically via [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static). No separate installation needed.

If you prefer your own ffmpeg build, install it on your PATH — it will take priority over the bundled version.

## Usage

```bash
# Interactive session picker
ccreplay

# Render by session ID (prefix match)
ccreplay <session-id>

# Render from a JSONL file path
ccreplay <path.jsonl>

# Custom video duration (seconds)
ccreplay --duration 60 <session>

# Custom output path
ccreplay -o output.mp4 <session>
```

## Options

| Flag | Description |
|---|---|
| `--duration, -d <seconds>` | Video duration (default: adaptive based on session length) |
| `--output, -o <path>` | Output file path (default: `ccreplay-<slug>.mp4`) |
| `--help, -h` | Show help |
| `--version, -v` | Show version |

## How it works

1. **Parse** — Reads Claude Code JSONL session logs, merging streaming message chunks by `message.id`
2. **Timeline** — Detects key moments (tool calls, errors, large edits) and allocates frame budgets proportionally
3. **Render** — Builds a virtual terminal buffer and draws each frame to a canvas with syntax highlighting, markdown rendering, and smooth scroll
4. **Encode** — Pipes raw RGBA frames to ffmpeg for H.264 MP4 output

## License

MIT
