import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import { COLORS, LAYOUT, GEOMETRY, TOOL_ACCENT } from "./theme.js";
import { TerminalState } from "./terminal-state.js";
import type { AllocatedEntry } from "../timeline/budget-allocator.js";
import type { ParsedSession } from "../parser/parse-session.js";
import { formatDuration, truncate } from "../util/format.js";
import { ensureFonts, font } from "./fonts.js";
import { roundRect, roundRectTop } from "./canvas-helpers.js";
import { drawIntroCard } from "./draw-intro.js";
import { drawOutroCard } from "./draw-outro.js";
import { drawStatusBar } from "./draw-status-bar.js";
import { drawTerminalBody } from "./draw-terminal-body.js";

const { termX: TERM_X, termY: TERM_Y, termW: TERM_W, termH: TERM_H } = GEOMETRY;

export class FrameRenderer {
  private canvas: Canvas;
  private ctx: SKRSContext2D;
  private session: ParsedSession;
  private entries: AllocatedEntry[];
  private totalFrames: number;
  private introFrames: number;
  private outroFrames: number;
  private lingerFrames: number;
  private termState: TerminalState;
  private builtUpToEntry: number = -1;
  private lastEntryIdx: number = 0;
  private staticBg: Canvas;
  private gradientBg: Canvas;
  private lingerCache: Canvas | null = null;

  constructor(session: ParsedSession, entries: AllocatedEntry[], totalFrames: number, introFrames: number, outroFrames: number, lingerFrames: number) {
    ensureFonts();
    this.canvas = createCanvas(LAYOUT.width, LAYOUT.height);
    this.ctx = this.canvas.getContext("2d");
    this.session = session;
    this.entries = entries;
    this.totalFrames = totalFrames;
    this.introFrames = introFrames;
    this.outroFrames = outroFrames;
    this.lingerFrames = lingerFrames;
    this.termState = new TerminalState();
    this.ctx.font = font(LAYOUT.fontSize);

    this.gradientBg = this.buildGradientBackground();
    this.staticBg = this.buildStaticBackground();
  }

  private buildGradientBackground(): Canvas {
    const bg = createCanvas(LAYOUT.width, LAYOUT.height);
    const ctx = bg.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, LAYOUT.width, LAYOUT.height);
    grad.addColorStop(0, COLORS.outerGradientStart);
    grad.addColorStop(1, COLORS.outerGradientEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
    return bg;
  }

  private buildStaticBackground(): Canvas {
    const bg = createCanvas(LAYOUT.width, LAYOUT.height);
    const ctx = bg.getContext("2d");

    // Blit cached gradient
    ctx.drawImage(this.gradientBg, 0, 0);

    // Drop shadow
    ctx.save();
    ctx.shadowColor = COLORS.windowShadow;
    ctx.shadowBlur = LAYOUT.shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = LAYOUT.shadowOffsetY;
    ctx.fillStyle = COLORS.background;
    roundRect(ctx, TERM_X, TERM_Y, TERM_W, TERM_H, LAYOUT.windowRadius);
    ctx.fill();
    ctx.restore();

    // Terminal window body (overdraws shadow rect with crisp fill)
    ctx.fillStyle = COLORS.background;
    roundRect(ctx, TERM_X, TERM_Y, TERM_W, TERM_H, LAYOUT.windowRadius);
    ctx.fill();

    // Title bar (static — never changes between content frames)
    this.drawTitleBarOn(ctx);

    return bg;
  }

  private drawTitleBarOn(ctx: SKRSContext2D) {
    const h = LAYOUT.titleBarHeight;

    // Background with rounded top corners
    ctx.fillStyle = COLORS.titleBarBg;
    roundRectTop(ctx, TERM_X, TERM_Y, TERM_W, h, LAYOUT.windowRadius);
    ctx.fill();

    // Bottom border (subtle glass separator)
    ctx.fillStyle = COLORS.titleBarBorder;
    ctx.fillRect(TERM_X, TERM_Y + h - 1, TERM_W, 1);

    // Traffic lights
    const dotY = TERM_Y + h / 2;
    const dotStartX = TERM_X + LAYOUT.trafficDotsLeftMargin + LAYOUT.trafficDotRadius;
    const r = LAYOUT.trafficDotRadius;
    const spacing = LAYOUT.trafficDotSpacing;
    const dotColors = [COLORS.trafficRed, COLORS.trafficYellow, COLORS.trafficGreen];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = dotColors[i];
      ctx.beginPath();
      ctx.arc(dotStartX + i * spacing, dotY, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const textY = TERM_Y + h / 2 + 5;

    // "ccreplay" text after traffic lights
    ctx.font = font(13);
    ctx.fillStyle = COLORS.subtle;
    ctx.textAlign = "left";
    ctx.fillText("ccreplay", dotStartX + spacing * 2 + 20, textY);

    // Center: model
    ctx.font = font(14, true);
    ctx.fillStyle = COLORS.inactive;
    ctx.textAlign = "center";
    ctx.fillText(this.session.model || "", LAYOUT.width / 2, textY);

    // Right: duration
    ctx.textAlign = "right";
    ctx.fillText(formatDuration(this.session.duration), TERM_X + TERM_W - LAYOUT.innerPadding, textY);

    ctx.textAlign = "left";
  }

  renderFrame(frameNum: number): Buffer {
    const ctx = this.ctx;

    const lingerStart = this.totalFrames - this.outroFrames - this.lingerFrames;
    const outroStart = this.totalFrames - this.outroFrames;

    if (frameNum < this.introFrames) {
      ctx.drawImage(this.gradientBg, 0, 0);
      drawIntroCard(ctx, this.session, this.introFrames, frameNum);
    } else if (frameNum >= outroStart) {
      ctx.drawImage(this.gradientBg, 0, 0);
      drawOutroCard(ctx, this.session, this.outroFrames, frameNum - outroStart);
    } else if (frameNum >= lingerStart) {
      // Linger: freeze last content frame with subtle fade
      if (!this.lingerCache) {
        // Render the content once and cache it
        ctx.drawImage(this.staticBg, 0, 0);
        const last = this.entries.length > 0
          ? { entry: this.entries[this.entries.length - 1], idx: this.entries.length - 1 }
          : null;
        this.drawContentFrame(lingerStart - 1, last);
        drawStatusBar(ctx, lingerStart - 1, this.totalFrames, this.introFrames, this.outroFrames, this.lingerFrames, last?.entry ?? null);
        this.lingerCache = createCanvas(LAYOUT.width, LAYOUT.height);
        this.lingerCache.getContext("2d").drawImage(this.canvas, 0, 0);
      }
      ctx.drawImage(this.lingerCache, 0, 0);

      // Subtle vignette fade during linger
      const lingerProgress = (frameNum - lingerStart) / (this.lingerFrames || 1);
      ctx.fillStyle = `rgba(0, 0, 0, ${lingerProgress * 0.3})`;
      ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
    } else {
      ctx.drawImage(this.staticBg, 0, 0);
      const found = this.findEntryAtFrame(frameNum);
      this.drawContentFrame(frameNum, found);
      drawStatusBar(ctx, frameNum, this.totalFrames, this.introFrames, this.outroFrames, this.lingerFrames, found?.entry ?? null);
    }

    return (this.canvas as any).data() as Buffer;
  }

  get rawWidth() { return LAYOUT.width; }
  get rawHeight() { return LAYOUT.height; }

  private drawContentFrame(frameNum: number, found: { entry: AllocatedEntry; idx: number } | null) {
    // Build terminal state up to the current entry
    if (!found) return;
    const { entry, idx: entryIdx } = found;

    // Add new items to terminal state as we reach new entries
    while (this.builtUpToEntry < entryIdx) {
      this.builtUpToEntry++;
      const e = this.entries[this.builtUpToEntry];
      this.addEventToTerminal(e);
    }

    // Calculate reveal progress for current entry
    const frames = entry.endFrame - entry.startFrame;
    const entryProgress = frames > 1
      ? (frameNum - entry.startFrame) / (frames - 1)
      : 1;

    // Compute streaming entry line count (used for both scroll and reveal)
    const isCurrentStreaming =
      ((entry.event.type as string) === "assistant_text" ||
       (entry.event.type as string) === "user_prompt") && entryProgress < 1;

    let streamingLineCount = 0;
    let streamingItemCount = 0;
    if (isCurrentStreaming) {
      const boundaries = this.termState.entryBoundaries;
      const entryStartIdx = boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;
      const entryEndIdx = this.termState.items.length;
      streamingItemCount = entryEndIdx - entryStartIdx;
      for (let gi = entryStartIdx; gi < entryEndIdx; gi++) {
        if (this.termState.items[gi].kind === "line") streamingLineCount++;
      }
    }

    const hiddenLines = isCurrentStreaming
      ? Math.max(0, streamingItemCount * (1 - entryProgress))
      : 0;

    // Advance smooth scroll
    this.termState.advanceScroll(LAYOUT.scrollLinesPerFrame, hiddenLines);

    // Draw the terminal body
    drawTerminalBody(this.ctx, this.termState, entryProgress, entry, streamingLineCount);
  }

  private addEventToTerminal(entry: AllocatedEntry) {
    this.termState.markEntryStart();
    const ev = entry.event;
    const evType = ev.type as string;
    switch (evType) {
      case "user_prompt":
        this.termState.addUserPrompt(ev.text);
        break;
      case "assistant_text":
        this.termState.addAssistantText(ev.text);
        break;
      case "tool_call": {
        const tc = ev.toolCall!;
        const toolName = tc.name;

        if (toolName === "Agent") {
          this.termState.addToolBox(toolName, tc.agentDescription || ev.text, false, false);
          break;
        }

        const accentColor = TOOL_ACCENT[toolName] || COLORS.claude;
        this.termState.addInlineTool(toolName, ev.text, accentColor);
        break;
      }
      case "tool_result": {
        const tr = ev.toolResult!;
        if (tr.isError) {
          const toolName = tr.toolName || "Error";
          const strippedContent = tr.content.replace(/^Exit code \d+\n*/, "");
          const errorLines = strippedContent.split("\n").filter(l => l.trim()).slice(0, 2).join("\n");
          this.termState.addToolBox(toolName, errorLines, true, false);
        } else if (tr.toolName === "Bash") {
          this.termState.addToolOutput(tr.content);
        } else {
          const toolName = tr.toolName || "Result";
          const accentColor = TOOL_ACCENT[toolName] || COLORS.claude;
          this.termState.addInlineTool(toolName, truncate(tr.content, 80), accentColor, "ok");
        }
        break;
      }
      case "compaction":
        this.termState.addCompaction();
        break;
      case "summary":
        this.termState.addSummaryLine(ev.text);
        break;
    }
  }

  private findEntryAtFrame(frameNum: number): { entry: AllocatedEntry; idx: number } | null {
    // Scan forward from last known position (entries are sorted, frames are sequential)
    for (let i = this.lastEntryIdx; i < this.entries.length; i++) {
      if (frameNum >= this.entries[i].startFrame && frameNum < this.entries[i].endFrame) {
        this.lastEntryIdx = i;
        return { entry: this.entries[i], idx: i };
      }
    }
    if (this.entries.length > 0) {
      const last = this.entries.length - 1;
      this.lastEntryIdx = last;
      return { entry: this.entries[last], idx: last };
    }
    return null;
  }
}
