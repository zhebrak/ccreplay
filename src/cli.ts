#!/usr/bin/env node

import { createRequire } from "module";
import { parseSession } from "./parser/parse-session.js";
import { extractMoments } from "./parser/extract-moments.js";
import { buildTimeline } from "./timeline/build-timeline.js";
import { allocateBudgets, getAdaptiveDuration } from "./timeline/budget-allocator.js";
import { FrameRenderer } from "./renderer/frame-renderer.js";
import { checkFfmpeg, printFfmpegInstallInstructions, createEncoder } from "./renderer/encode-video.js";
import { findSession } from "./parser/session-finder.js";
import { pickSession } from "./explorer.js";
import { formatDuration, formatTokens } from "./util/format.js";
import { COLORS, LAYOUT, parseRgb } from "./renderer/theme.js";

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

const CLAUDE_RGB = parseRgb(COLORS.claude);
const SUCCESS_RGB = parseRgb(COLORS.success);

const SPINNER = ["\u280B", "\u2819", "\u2839", "\u2838", "\u2834", "\u2826", "\u2827", "\u2807"];

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

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let targetDuration: number | null = null;
  let outputPath: string | null = null;
  let sessionQuery: string | null = null;

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
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    } else if (arg === "--version" || arg === "-v") {
      console.log(pkg.version);
      return;
    } else if (!arg.startsWith("-")) {
      sessionQuery = arg;
    }
  }

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
  const fps = LAYOUT.fps;
  const introS = 1.5;
  const outroS = 2;
  const lingerS = 2;
  const totalFrames = Math.round(durationS * fps);
  const introFrames = Math.round(introS * fps);
  const outroFrames = Math.round(outroS * fps);

  const allocated = allocateBudgets(timeline, {
    targetDurationS: durationS,
    fps,
    width: LAYOUT.width,
    height: LAYOUT.height,
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
    width: LAYOUT.width,
    height: LAYOUT.height,
    fps,
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

  Options:
    --duration, -d <seconds>  Video duration (default: adaptive)
    --output, -o <path>       Output file path
    --help, -h                Show this help
    --version, -v             Show version
`);
}

main().catch((err) => {
  console.error("\n  Error:", err.message || err);
  process.exit(1);
});
