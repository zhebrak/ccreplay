#!/usr/bin/env node

import { createRequire } from "module";
import { writeFileSync, existsSync } from "fs";
import { parseSession } from "./parser/parse-session.js";
import { extractMoments } from "./parser/extract-moments.js";
import { buildTimeline } from "./timeline/build-timeline.js";
import { allocateBudgets, getAdaptiveDuration } from "./timeline/budget-allocator.js";
import { FrameRenderer } from "./renderer/frame-renderer.js";
import { checkFfmpeg, printFfmpegInstallInstructions, createEncoder } from "./renderer/encode-video.js";
import { findSession } from "./parser/session-finder.js";
import { pickSession } from "./explorer.js";
import { formatDuration, formatTokens } from "./util/format.js";
import { COLORS, LAYOUT, parseRgb, initTheme } from "./renderer/theme.js";
import { initFonts } from "./renderer/fonts.js";
import { resolveConfig, generateStarterConfig } from "./config/resolve.js";
import type { CcreplayConfig } from "./config/schema.js";
import { FONT_PRESETS } from "./config/fonts.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

// ANSI helpers for colored progress bar
const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ERASE_EOL = "\x1b[K";

const SPINNER = ["\u280B", "\u2819", "\u2839", "\u2838", "\u2834", "\u2826", "\u2827", "\u2807"];

let CLAUDE_RGB: [number, number, number];
let SUCCESS_RGB: [number, number, number];

function renderProgressBar(frame: number, total: number, startTime: number): string {
  const t = frame / total;
  const pct = Math.round(t * 100);
  const barWidth = 30;
  const filled = Math.round(t * barWidth);

  const claudeFg = fg(...CLAUDE_RGB);
  const bar = `${claudeFg}${"\u2588".repeat(filled)}${fg(50, 50, 50)}${"\u2500".repeat(barWidth - filled)}`;

  const spinIdx = Math.floor(frame / 4) % SPINNER.length;
  const spinner = `${claudeFg}${SPINNER[spinIdx]}`;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return `\r  ${spinner} ${RESET}Rendering ${bar}${RESET} ${DIM}${pct}%  ${elapsed}s${RESET}${ERASE_EOL}`;
}

/** Parse resolution string: "720p", "1080p", "1440p", "4k", or "WxH" */
function parseResolution(val: string): { width: number; height: number } {
  const presets: Record<string, [number, number]> = {
    "720": [1280, 720],
    "1080": [1920, 1080],
    "1440": [2560, 1440],
    "2160": [3840, 2160],
    "4k": [3840, 2160],
  };
  const key = val.toLowerCase().replace(/p$/, "");
  const preset = presets[key];
  if (preset) return { width: preset[0], height: preset[1] };

  const m = val.match(/^(\d+)x(\d+)$/i);
  if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };

  throw new Error(`Invalid resolution: "${val}". Use 720[p], 1080[p], 1440[p], 4k, or WxH (e.g. 1920x1080)`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let targetDuration: number | null = null;
  let outputPath: string | null = null;
  let sessionQuery: string | null = null;
  let configPath: string | undefined;
  const cliOverrides: Partial<CcreplayConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--duration" || arg === "-d") {
      targetDuration = parseInt(args[++i], 10);
      if (!targetDuration || targetDuration <= 0) {
        console.error(`\n  Invalid duration: ${args[i]}\n`);
        process.exit(1);
      }
    } else if (arg === "-o" || arg === "--output") {
      outputPath = args[++i];
    } else if (arg === "--theme" || arg === "-t") {
      cliOverrides.theme = args[++i];
    } else if (arg === "--resolution" || arg === "-r") {
      const res = parseResolution(args[++i]);
      cliOverrides.video = { ...cliOverrides.video, width: res.width, height: res.height };
    } else if (arg === "--fps") {
      cliOverrides.video = { ...cliOverrides.video, fps: parseInt(args[++i], 10) };
    } else if (arg === "--font-size") {
      cliOverrides.font = { ...cliOverrides.font, size: parseInt(args[++i], 10) };
    } else if (arg === "--font") {
      const val = args[++i];
      if (FONT_PRESETS[val]) {
        cliOverrides.font = { ...cliOverrides.font, preset: val, regularPath: undefined };
      } else {
        cliOverrides.font = { ...cliOverrides.font, regularPath: val, preset: undefined };
      }
    } else if (arg === "--font-bold") {
      cliOverrides.font = { ...cliOverrides.font, boldPath: args[++i] };
    } else if (arg === "--config" || arg === "-c") {
      configPath = args[++i];
    } else if (arg === "--init") {
      const target = "ccreplay.config.json";
      if (existsSync(target)) {
        console.error(`\n  ${target} already exists. Remove it first to regenerate.\n`);
        process.exit(1);
      }
      writeFileSync(target, generateStarterConfig());
      console.log(`\n  Created ${target}\n`);
      return;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    } else if (arg === "--version" || arg === "-v") {
      console.log(pkg.version);
      return;
    } else if (arg === "--") {
      // POSIX end-of-options: treat remaining args as positional
      if (i + 1 < args.length) sessionQuery = args[++i];
    } else if (!arg.startsWith("-")) {
      sessionQuery = arg;
    } else {
      console.error(`\n  Unknown option: ${arg}`);
      console.error("  Run ccreplay --help to see available options.\n");
      process.exit(1);
    }
  }

  // Resolve config: defaults <- theme <- config file <- CLI
  const config = resolveConfig(cliOverrides, configPath);
  initTheme(config);
  initFonts(config);
  CLAUDE_RGB = parseRgb(COLORS.claude);
  SUCCESS_RGB = parseRgb(COLORS.success);

  // Check ffmpeg
  if (!checkFfmpeg()) {
    printFfmpegInstallInstructions();
    process.exit(1);
  }

  // Find session
  let sessionPath: string | null = null;

  if (sessionQuery) {
    sessionPath = findSession(sessionQuery);
    if (!sessionPath) {
      console.error(`\n  Session not found: ${sessionQuery}`);
      console.error("  Run ccreplay with no args to browse sessions.\n");
      process.exit(1);
    }
  } else {
    sessionPath = await pickSession();
    if (!sessionPath) {
      process.exit(0);
    }
  }

  // Parse
  console.log(`\n  Parsing session...`);
  const session = parseSession(sessionPath);
  console.log(`  ${session.events.length} events, ${formatDuration(session.duration)} session`);

  if (session.events.length === 0) {
    console.error("  No events found in session.\n");
    process.exit(1);
  }

  // Build timeline
  const moments = extractMoments(session.events);
  console.log(`  ${moments.length} key moments detected`);

  const timeline = buildTimeline(session.events, moments);

  // Determine duration
  const durationS = targetDuration || getAdaptiveDuration(session.duration);
  const fps = config.video.fps;
  const introS = config.timing.introDuration;
  const outroS = config.timing.outroDuration;
  const lingerS = config.timing.lingerDuration;
  const totalFrames = Math.round(durationS * fps);
  const introFrames = Math.round(introS * fps);
  const outroFrames = Math.round(outroS * fps);

  const allocated = allocateBudgets(timeline, {
    targetDurationS: durationS,
    fps,
    width: config.video.width,
    height: config.video.height,
    introDurationS: introS,
    outroDurationS: outroS,
    lingerDurationS: lingerS,
  });

  console.log(`  Timeline: ${allocated.length} entries, ${durationS}s video`);

  // Render
  const outFile = outputPath || `ccreplay-${session.slug}.mp4`;
  console.log(`  Rendering to ${outFile}...`);

  const lingerFrames = Math.round(lingerS * fps);
  const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, outroFrames, lingerFrames);
  const encoder = createEncoder({
    outputPath: outFile,
    width: config.video.width,
    height: config.video.height,
    fps,
    crf: config.video.crf,
    preset: config.video.preset,
  });

  process.stdout.write(HIDE_CURSOR);
  const onSigint = () => { process.stdout.write(SHOW_CURSOR); process.exit(130); };
  process.on("SIGINT", onSigint);

  try {
    const startTime = Date.now();
    for (let f = 0; f < totalFrames; f++) {
      const buf = renderer.renderFrame(f);
      await encoder.writeFrame(buf);

      // Progress every 2%
      if (f % Math.max(1, Math.floor(totalFrames / 50)) === 0) {
        process.stdout.write(renderProgressBar(f, totalFrames, startTime));
      }
    }

    await encoder.finish();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(renderProgressBar(totalFrames, totalFrames, startTime));
    console.log(`\n\n  ${fg(...SUCCESS_RGB)}\u2713${RESET} ${BOLD}Done in ${elapsed}s${RESET} \u2192 ${outFile}\n`);
  } finally {
    process.off("SIGINT", onSigint);
    process.stdout.write(SHOW_CURSOR);
  }
}

function printHelp() {
  console.log(`
  ccreplay \u2014 Terminal replay videos of Claude Code sessions

  Usage:
    ccreplay                          Interactive session picker
    ccreplay <session-id>             Render by session ID (prefix match)
    ccreplay <path.jsonl>             Render from file path
    ccreplay --duration 60 <session>  Custom video length
    ccreplay -o output.mp4 <session>  Custom output path
    ccreplay -r 720p <session>        Custom resolution

  Options:
    --duration, -d <seconds>  Video duration (default: adaptive)
    --output, -o <path>       Output file path (default: ccreplay-<slug>.mp4)
    --theme, -t <name>        Theme: default, dracula, monokai, solarized-dark, light (default: default)
    --resolution, -r <res>    Resolution: 720[p], 1080[p], 1440[p], 4k, or WxH (default: 1080p)
    --fps <n>                 Frame rate (default: 60)
    --font-size <n>           Font size in px (default: 18)
    --font <name|path>        Font: jetbrains-mono (default), fira-code, source-code-pro, or path to .ttf
    --font-bold <path>        Path to bold variant .ttf (for custom fonts)
    --config, -c <path>       Path to config file (default: auto-detect)
    --init                    Generate starter ccreplay.config.json
    --help, -h                Show this help
    --version, -v             Show version
`);
}

main().catch((err) => {
  console.error("\n  Error:", err.message || err);
  process.exit(1);
});
