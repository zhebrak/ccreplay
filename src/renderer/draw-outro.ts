import type { SKRSContext2D } from "@napi-rs/canvas";
import { COLORS, LAYOUT } from "./theme.js";
import { font } from "./fonts.js";
import { roundRect, measureText } from "./canvas-helpers.js";
import { formatDuration, formatTokens } from "../util/format.js";
import type { ParsedSession } from "../parser/parse-session.js";

function drawStatCard(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, label: string, value: string) {
  // Card background
  ctx.fillStyle = COLORS.cardBg;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  // Label
  ctx.font = font(13);
  ctx.fillStyle = COLORS.inactive;
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + 34);

  // Value
  ctx.font = font(20, true);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(value, x + w / 2, y + 58);

  ctx.textAlign = "left";
}

export function drawOutroCard(ctx: SKRSContext2D, session: ParsedSession, outroFrames: number, frame: number) {
  const progress = frame / outroFrames;
  const alpha = Math.min(1, progress * 2);

  ctx.globalAlpha = alpha;

  const cx = LAYOUT.width / 2;
  const cy = LAYOUT.height / 2;

  // Title
  ctx.font = font(28, true);
  ctx.fillStyle = COLORS.claude;
  ctx.textAlign = "center";
  ctx.fillText("Session Complete", cx, cy - 140);

  // 2x2 stat card grid
  const stats = [
    ["Duration", formatDuration(session.duration)],
    ["Tool Calls", String(session.toolCallCount)],
    ["Files Changed", String(session.filesChanged.size)],
    ["Tokens", formatTokens(session.totalTokens)],
  ];

  const cardW = 220;
  const cardH = 100;
  const gap = 16;
  const gridW = cardW * 2 + gap;
  const gridH = cardH * 2 + gap;
  const gridX = cx - gridW / 2;
  const gridY = cy - gridH / 2 - 20;

  for (let i = 0; i < stats.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridX + col * (cardW + gap);
    const y = gridY + row * (cardH + gap);
    drawStatCard(ctx, x, y, cardW, cardH, stats[i][0], stats[i][1]);

    // Draw diff stats detail line on Files Changed card
    if (i === 2) {
      const added = session.totalLinesAdded;
      const removed = session.totalLinesRemoved;
      if (added + removed > 0) {
        const addText = `+${added}`;
        const removeText = `-${removed}`;
        ctx.font = font(12);
        const addW = measureText(addText);
        const sepW = measureText(" / ");
        const removeW = measureText(removeText);
        const totalW = addW + sepW + removeW;
        const startX = x + cardW / 2 - totalW / 2;
        const detailY = y + 80;

        ctx.save();
        ctx.textAlign = "left";
        ctx.fillStyle = COLORS.success;
        ctx.fillText(addText, startX, detailY);
        ctx.fillStyle = COLORS.inactive;
        ctx.fillText(" / ", startX + addW, detailY);
        ctx.fillStyle = COLORS.error;
        ctx.fillText(removeText, startX + addW + sepW, detailY);
        ctx.restore();
      }
    }
  }

  // Slug below grid
  ctx.font = font(14);
  ctx.fillStyle = COLORS.subtle;
  ctx.textAlign = "center";
  ctx.fillText(session.slug, cx, gridY + gridH + 50);

  // Branding
  ctx.font = font(16, true);
  ctx.fillStyle = COLORS.claude;
  ctx.fillText("ccreplay", cx, gridY + gridH + 90);

  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}
