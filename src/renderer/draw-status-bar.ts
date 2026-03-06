import type { SKRSContext2D } from "@napi-rs/canvas";
import { COLORS, LAYOUT, GEOMETRY } from "./theme.js";
import { font } from "./fonts.js";
import { roundRect, roundRectBottom } from "./canvas-helpers.js";
import { formatTokens } from "../util/format.js";
import type { AllocatedEntry } from "../timeline/budget-allocator.js";

const { termX: TERM_X, termY: TERM_Y, termW: TERM_W, termH: TERM_H } = GEOMETRY;

export function drawStatusBar(
  ctx: SKRSContext2D,
  frameNum: number,
  totalFrames: number,
  introFrames: number,
  outroFrames: number,
  lingerFrames: number,
  entry: AllocatedEntry | null,
) {
  const barY = TERM_Y + TERM_H - LAYOUT.statusBarHeight;
  const h = LAYOUT.statusBarHeight;

  // Background with rounded bottom corners
  ctx.fillStyle = COLORS.statusBarBg;
  roundRectBottom(ctx, TERM_X, barY, TERM_W, h, LAYOUT.windowRadius);
  ctx.fill();

  // Top border (subtle orange glow)
  ctx.fillStyle = COLORS.statusBarBorder;
  ctx.fillRect(TERM_X, barY, TERM_W, 1);

  const globalProgress = (frameNum - introFrames) /
    (totalFrames - introFrames - outroFrames - lingerFrames);

  // Progress bar
  const pbX = TERM_X + LAYOUT.innerPadding;
  const pbY = barY + h / 2 - 3;
  const pbW = TERM_W * GEOMETRY.progressBarWidthRatio;
  const pbH = GEOMETRY.progressBarHeight;

  ctx.fillStyle = COLORS.progressBg;
  roundRect(ctx, pbX, pbY, pbW, pbH, 3);
  ctx.fill();

  const fillW = pbW * Math.max(0, Math.min(1, globalProgress));
  if (fillW > 0) {
    ctx.fillStyle = COLORS.progressFill;
    roundRect(ctx, pbX, pbY, fillW, pbH, 3);
    ctx.fill();
  }

  // Percentage
  ctx.font = font(13);
  ctx.fillStyle = COLORS.inactive;
  ctx.fillText(`${Math.round(globalProgress * 100)}%`, pbX + pbW + 16, barY + h / 2 + 5);

  // Right side: tokens and files
  ctx.textAlign = "right";
  const tokens = entry ? formatTokens(entry.cumulativeTokens) : "0";
  const files = entry ? entry.cumulativeFiles : 0;
  ctx.fillText(`${tokens} tokens   ${files} files`, TERM_X + TERM_W - LAYOUT.innerPadding, barY + h / 2 + 5);
  ctx.textAlign = "left";
}
