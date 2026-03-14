import type { SKRSContext2D } from "@napi-rs/canvas";
import { COLORS, LAYOUT, GEOMETRY } from "./theme.js";
import { font } from "./fonts.js";
import { roundRect, roundRectBottom } from "./canvas-helpers.js";
import { formatTokens } from "../util/format.js";
import type { AllocatedEntry } from "../timeline/budget-allocator.js";

export function drawStatusBar(
  ctx: SKRSContext2D,
  progress: number,
  entry: AllocatedEntry | null,
) {
  const barY = GEOMETRY.termY + GEOMETRY.termH - LAYOUT.statusBarHeight;
  const h = LAYOUT.statusBarHeight;

  // Background with rounded bottom corners
  ctx.fillStyle = COLORS.statusBarBg;
  roundRectBottom(ctx, GEOMETRY.termX, barY, GEOMETRY.termW, h, LAYOUT.windowRadius);
  ctx.fill();

  // Top border (subtle orange glow)
  ctx.fillStyle = COLORS.statusBarBorder;
  ctx.fillRect(GEOMETRY.termX, barY, GEOMETRY.termW, 1);

  // Progress bar
  const pbX = GEOMETRY.termX + LAYOUT.innerPadding;
  const pbY = barY + h / 2 - 3;
  const pbW = GEOMETRY.termW * GEOMETRY.progressBarWidthRatio;
  const pbH = GEOMETRY.progressBarHeight;

  ctx.fillStyle = COLORS.progressBg;
  roundRect(ctx, pbX, pbY, pbW, pbH, 3);
  ctx.fill();

  const fillW = pbW * Math.max(0, Math.min(1, progress));
  if (fillW > 0) {
    ctx.fillStyle = COLORS.progressFill;
    roundRect(ctx, pbX, pbY, fillW, pbH, 3);
    ctx.fill();
  }

  // Percentage
  ctx.font = font(13);
  ctx.fillStyle = COLORS.inactive;
  ctx.fillText(`${Math.round(progress * 100)}%`, pbX + pbW + 16, barY + h / 2 + 5);

  // Right side: tokens and files
  ctx.textAlign = "right";
  const tokens = entry ? formatTokens(entry.cumulativeTokens) : "0";
  const files = entry ? entry.cumulativeFiles : 0;
  ctx.fillText(`${tokens} tokens   ${files} files`, GEOMETRY.termX + GEOMETRY.termW - LAYOUT.innerPadding, barY + h / 2 + 5);
  ctx.textAlign = "left";
}
