# ccreplay

[![CI](https://github.com/zhebrak/ccreplay/actions/workflows/ci.yml/badge.svg)](https://github.com/zhebrak/ccreplay/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@zhebrak/ccreplay.svg)](https://www.npmjs.com/package/@zhebrak/ccreplay)

Terminal replay videos of Claude Code sessions. Turns JSONL session logs into polished MP4 videos with syntax highlighting, tool call visualization, and smooth scrolling.

<video src="https://github.com/user-attachments/assets/afb71640-c885-437e-8ed5-d7ec21f6e1a2" width="320" height="240" controls autoplay loop muted playsinline></video>

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

# Use a theme
ccreplay --theme dracula <session>

# Use a different font
ccreplay --font fira-code <session>

# 720p with larger font
ccreplay -r 720p --font-size 24 <session>
```

## Options

| Flag | Description |
|---|---|
| `--duration, -d <seconds>` | Video duration (default: adaptive based on session length) |
| `--output, -o <path>` | Output file path (default: `ccreplay-<slug>.mp4`) |
| `--theme, -t <name>` | Theme: `default`, `dracula`, `monokai`, `solarized-dark`, `light` |
| `--resolution, -r <res>` | Resolution: `720p`, `1080p`, `1440p`, `4k`, or `WxH` |
| `--fps <n>` | Frame rate (default: 60) |
| `--font-size <n>` | Font size in px (default: 18) |
| `--font <name\|path>` | Font: `jetbrains-mono`, `fira-code`, `source-code-pro`, or path to `.ttf` |
| `--font-bold <path>` | Path to bold variant `.ttf` (for custom fonts) |
| `--config, -c <path>` | Path to config file |
| `--init` | Generate starter `ccreplay.config.json` |
| `--help, -h` | Show help |
| `--version, -v` | Show version |

## Themes

Five built-in themes:

| Theme | Description |
|---|---|
| `default` | Dark blue-gray with warm orange accents |
| `dracula` | Purple-tinted dark theme |
| `monokai` | Classic warm dark theme |
| `solarized-dark` | Ethan Schoonover's dark palette |
| `light` | Light background for bright environments |

```bash
ccreplay --theme dracula <session>
```

## Fonts

Three built-in monospace fonts (SIL Open Font License):

| Font | Flag value |
|---|---|
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (default) | `jetbrains-mono` |
| [Fira Code](https://github.com/tonsky/FiraCode) | `fira-code` |
| [Source Code Pro](https://github.com/adobe-fonts/source-code-pro) | `source-code-pro` |

```bash
ccreplay --font fira-code <session>
```

Custom `.ttf` fonts are also supported:

```bash
ccreplay --font /path/to/MyFont-Regular.ttf --font-bold /path/to/MyFont-Bold.ttf <session>
```

## Configuration

### Config file

ccreplay looks for config files in order:

1. `./ccreplay.config.json` (project-local)
2. `~/.config/ccreplay/config.json` (user-global)

Generate a starter config:

```bash
ccreplay --init
```

### Precedence

Settings are layered: **defaults ← theme ← config file ← CLI flags**

CLI flags always win. A config file can set a theme, and individual CLI flags override specific values on top.

### Example config

```json
{
  "theme": "dracula",
  "colors": {
    "accent": "#ff79c6"
  },
  "font": {
    "preset": "fira-code",
    "size": 20
  },
  "video": {
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "crf": 23
  },
  "timing": {
    "introDuration": 1.5,
    "outroDuration": 2,
    "lingerDuration": 2
  },
  "window": {
    "controls": true
  }
}
```

### All options

Defaults shown are for the `default` theme. Each built-in theme overrides colors, ansiColors, and syntaxColors with its own palette.

#### `colors`

| Property | Default | Description |
|---|---|---|
| `accent` | `#d77757` | Primary accent (progress bars, highlights) |
| `text` | `#ffffff` | Main text color |
| `dimmed` | `#999999` | Secondary/muted text |
| `subtle` | `#505050` | Borders, faint UI elements |
| `background` | `#121218` | Terminal background |
| `success` | `#4eba65` | Success indicators |
| `error` | `#ff6b80` | Error indicators |
| `warning` | `#ffc107` | Warning indicators |
| `titleBarBg` | `#141c20` | Title bar background |
| `statusBarBg` | `#10181c` | Status bar background |
| `gradientStart` | `#0a1418` | Outer gradient start |
| `gradientEnd` | `#081016` | Outer gradient end |
| `codeBg` | `#1c2428` | Code block background |
| `bashBg` | `#20282c` | Shell command background |
| `bashBorder` | `#fd5db1` | Shell command border |

#### `ansiColors`

Terminal ANSI color palette. Each theme provides its own palette; override individual colors as needed.

| Property | Default |
|---|---|
| `black` | `#505050` |
| `red` | `#ff6b80` |
| `green` | `#4eba65` |
| `yellow` | `#ffc107` |
| `blue` | `#6495ed` |
| `magenta` | `#d77757` |
| `cyan` | `#00b7eb` |
| `white` | `#ffffff` |
| `brightBlack` | `#808080` |
| `brightRed` | `#ff9696` |
| `brightGreen` | `#78dc8c` |
| `brightYellow` | `#ffdc64` |
| `brightBlue` | `#96b4ff` |
| `brightMagenta` | `#ff96c8` |
| `brightCyan` | `#64dcff` |
| `brightWhite` | `#ffffff` |

#### `syntaxColors`

Code syntax highlighting colors.

| Property | Default | Highlights |
|---|---|---|
| `keyword` | `#af87ff` | `if`, `return`, `const`, etc. |
| `string` | `#4eba65` | String literals |
| `comment` | `#808080` | Comments |
| `number` | `#ffc107` | Numeric literals |
| `type` | `#00b7eb` | Type names |

#### `font`

| Property | Default | Description |
|---|---|---|
| `preset` | `jetbrains-mono` | Built-in font: `jetbrains-mono`, `fira-code`, `source-code-pro` |
| `size` | `18` | Font size in px (8–72) |
| `lineHeight` | `32` | Line height in px (auto-derived as `round(size × 1.75)` when size differs from default) |
| `regularPath` | — | Path to custom `.ttf` (overrides preset) |
| `boldPath` | — | Path to custom bold `.ttf` |

#### `video`

| Property | Default | Description |
|---|---|---|
| `width` | `1920` | Width in px (320–7680, must be even) |
| `height` | `1080` | Height in px (240–4320, must be even) |
| `fps` | `60` | Frame rate (1–120) |
| `crf` | `23` | FFmpeg quality factor (0=lossless, 51=worst) |
| `preset` | `ultrafast` | FFmpeg encoding speed: `ultrafast` through `placebo` |

#### `timing`

| Property | Default | Description |
|---|---|---|
| `introDuration` | `1.5` | Intro animation (seconds) |
| `outroDuration` | `2` | Outro animation (seconds) |
| `lingerDuration` | `2` | Pause on final frame (seconds) |
| `scrollSpeed` | `0.15` | Scroll animation speed (>0 to 10, lower = smoother) |

#### `window`

| Property | Default | Description |
|---|---|---|
| `controls` | `true` | Title bar button visibility |
| `outerPadding` | `40` | Padding around window (px) |
| `innerPadding` | `36` | Padding inside window (px) |
| `radius` | `16` | Window corner radius (px) |

For the authoritative schema, see [`src/config/schema.ts`](src/config/schema.ts).

## How it works

1. **Parse** — Reads Claude Code JSONL session logs, merging streaming message chunks by `message.id`
2. **Timeline** — Detects key moments (tool calls, errors, large edits) and allocates frame budgets proportionally
3. **Render** — Builds a virtual terminal buffer and draws each frame to a canvas with syntax highlighting, markdown rendering, and smooth scroll
4. **Encode** — Pipes raw RGBA frames to ffmpeg for H.264 MP4 output

## License

MIT
