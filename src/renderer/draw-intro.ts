import type { SKRSContext2D } from "@napi-rs/canvas";
import { COLORS, LAYOUT, withAlpha } from "./theme.js";
import { font } from "./fonts.js";
import { formatDuration } from "../util/format.js";
import type { ParsedSession } from "../parser/parse-session.js";

function drawSparkle(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
  ctx.fillStyle = COLORS.claude;
  ctx.beginPath();
  // 4-pointed star
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx + size * 0.15, cy - size * 0.15, cx + size, cy);
  ctx.quadraticCurveTo(cx + size * 0.15, cy + size * 0.15, cx, cy + size);
  ctx.quadraticCurveTo(cx - size * 0.15, cy + size * 0.15, cx - size, cy);
  ctx.quadraticCurveTo(cx - size * 0.15, cy - size * 0.15, cx, cy - size);
  ctx.closePath();
  ctx.fill();
}

export function drawIntroCard(ctx: SKRSContext2D, session: ParsedSession, introFrames: number, frame: number) {
  const progress = frame / introFrames;
  const alpha = Math.min(1, progress * 2);

  const cx = LAYOUT.width / 2;
  const cy = LAYOUT.height / 2;

  // Subtle radial glow behind center
  const glowGrad = ctx.createRadialGradient(cx, cy - 40, 0, cx, cy - 40, 300);
  glowGrad.addColorStop(0, withAlpha(COLORS.claude, 0.08));
  glowGrad.addColorStop(1, withAlpha(COLORS.claude, 0));
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);

  ctx.globalAlpha = alpha;

  // Sparkle icon above title
  drawSparkle(ctx, cx, cy - 100, 24);

  // Session slug
  ctx.font = font(36, true);
  ctx.fillStyle = COLORS.claude;
  ctx.textAlign = "center";
  ctx.fillText(session.slug, cx, cy - 40);

  // Model
  ctx.font = font(16);
  ctx.fillStyle = COLORS.inactive;
  ctx.fillText(session.model || "", cx, cy + 10);

  // Duration
  ctx.fillText(formatDuration(session.duration), cx, cy + 42);

  // Date
  const date = new Date(session.startTime);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  ctx.fillText(dateStr, cx, cy + 74);

  // Branding
  ctx.font = font(16, true);
  ctx.fillStyle = COLORS.claude;
  ctx.fillText("ccreplay", cx, cy + 140);

  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}
