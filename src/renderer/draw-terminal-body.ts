import type { SKRSContext2D } from "@napi-rs/canvas";
import { COLORS, LAYOUT, GEOMETRY, withAlpha } from "./theme.js";
import { font } from "./fonts.js";
import { roundRect, roundRectStroke, roundRectTop, measureText, wrapTextForWidth } from "./canvas-helpers.js";
import { truncate } from "../util/format.js";
import type { TerminalState } from "./terminal-state.js";
import type { RenderItem, ToolBox, InlineTool, SummaryLine } from "./types.js";
import type { AllocatedEntry } from "../timeline/budget-allocator.js";

function drawInlineTool(ctx: SKRSContext2D, tool: InlineTool, x: number, y: number, maxWidth: number, skipBorder?: boolean): number {
  const indent = LAYOUT.charWidth * 4;

  if (!skipBorder) {
    // Top border line
    const lineY = y - LAYOUT.fontSize / 2 + LAYOUT.lineHeight / 2;
    ctx.strokeStyle = tool.accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + indent, lineY);
    ctx.lineTo(x + indent + maxWidth * 0.6, lineY);
    ctx.stroke();
    y += LAYOUT.lineHeight;
  }

  // Tool name (bold, accent color)
  let nameX = x + indent + 4;
  ctx.font = font(LAYOUT.fontSize, true);
  ctx.fillStyle = tool.accentColor;
  ctx.fillText(tool.toolName, nameX, y);
  let textX = nameX + measureText(tool.toolName) + LAYOUT.charWidth;

  // Content (dimmed)
  ctx.font = font(LAYOUT.fontSize);
  ctx.fillStyle = COLORS.inactive;
  const contentText = truncate(tool.content, 100);
  ctx.fillText(contentText, textX, y);
  textX += measureText(contentText) + LAYOUT.charWidth;

  // Status icon
  if (tool.status === "ok") {
    ctx.fillStyle = COLORS.success;
    ctx.font = font(LAYOUT.fontSize, true);
    ctx.fillText("\u2713", textX, y);
  } else if (tool.status === "error") {
    ctx.fillStyle = COLORS.error;
    ctx.font = font(LAYOUT.fontSize, true);
    ctx.fillText("\u2717", textX, y);
  }

  return y + LAYOUT.lineHeight;
}

function drawSummaryLine(ctx: SKRSContext2D, summary: SummaryLine, x: number, y: number): number {
  const indent = LAYOUT.charWidth * 2;

  ctx.font = font(LAYOUT.fontSize);
  ctx.fillStyle = COLORS.inactive;
  ctx.fillText(`  ${summary.text}`, x + indent, y);

  return y + LAYOUT.lineHeight;
}

function drawToolBox(ctx: SKRSContext2D, box: ToolBox, x: number, y: number, maxWidth: number): number {
  const pad = LAYOUT.toolBoxPadding;
  const radius = LAYOUT.toolBoxRadius;
  const borderW = LAYOUT.toolBoxBorderWidth;

  // Compute content height (cached since toolbox content is immutable)
  const innerWidth = maxWidth - pad * 2;
  if (!box._wrappedCache || box._wrappedCache.width !== innerWidth) {
    box._wrappedCache = { width: innerWidth, lines: wrapTextForWidth(box.content, innerWidth) };
  }
  const contentLines = box._wrappedCache.lines;
  const contentHeight = Math.max(1, contentLines.length) * LAYOUT.lineHeight;
  const headerHeight = LAYOUT.lineHeight;
  const totalHeight = headerHeight + contentHeight + pad;

  // Draw rounded border
  ctx.strokeStyle = box.borderColor;
  ctx.lineWidth = borderW;
  roundRectStroke(ctx, x, y, maxWidth, totalHeight, radius);

  // Header background: gradient fill (15% -> 5% opacity left to right)
  ctx.save();
  roundRectTop(ctx, x + borderW, y + borderW, maxWidth - borderW * 2, headerHeight - 2, radius - 1);
  ctx.clip();
  const headerGrad = ctx.createLinearGradient(x, y, x + maxWidth, y);
  headerGrad.addColorStop(0, withAlpha(box.borderColor, 0.15));
  headerGrad.addColorStop(1, withAlpha(box.borderColor, 0.05));
  ctx.fillStyle = headerGrad;
  ctx.fillRect(x + borderW, y + borderW, maxWidth - borderW * 2, headerHeight - 2);
  ctx.restore();

  // Left accent stripe
  ctx.fillStyle = box.borderColor;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x + borderW, y + borderW, 3, totalHeight - borderW * 2);
  ctx.globalAlpha = 1;

  // Header text
  ctx.font = font(LAYOUT.fontSizeTitle, true);
  ctx.fillStyle = box.borderColor;
  ctx.fillText(box.toolName, x + pad, y + headerHeight - 4);

  // Content
  let cy = y + headerHeight + 4;
  for (const line of contentLines) {
    let color: string = COLORS.text;
    if (box.hasError) color = COLORS.error;
    else if (box.hasSuccess) color = COLORS.success;

    ctx.font = font(LAYOUT.fontSize);
    ctx.fillStyle = color;
    ctx.fillText(truncate(line, 150), x + pad, cy + LAYOUT.fontSize);
    cy += LAYOUT.lineHeight;
  }

  return y + totalHeight;
}

export function drawTerminalBody(
  ctx: SKRSContext2D,
  termState: TerminalState,
  progress: number,
  currentEntry: AllocatedEntry,
  streamingLineCount: number,
) {
  const items = termState.getVisibleItems();

  // Clip to terminal window body area
  ctx.save();
  ctx.beginPath();
  ctx.rect(GEOMETRY.termX, GEOMETRY.termY + LAYOUT.titleBarHeight, GEOMETRY.termW, GEOMETRY.termH - LAYOUT.titleBarHeight - LAYOUT.statusBarHeight);
  ctx.clip();

  // Determine line-by-line reveal for streaming effect
  const isCurrentAssistant = (currentEntry.event.type as string) === "assistant_text";
  const isCurrentPrompt = (currentEntry.event.type as string) === "user_prompt";
  const isStreaming = (isCurrentAssistant || isCurrentPrompt) && progress < 1;

  // Find current entry's items using entryBoundaries
  const boundaries = termState.entryBoundaries;
  const entryStartIdx = boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;
  const entryEndIdx = termState.items.length;

  const revealLines = isStreaming ? progress * streamingLineCount : Infinity;

  // Visible window offset - maps visible array index to global items index
  const visibleStartGlobal = termState.visibleStartIdx;

  let y = GEOMETRY.bodyTop - termState.scrollPixelOffset;
  let entryLineIdx = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const globalIdx = visibleStartGlobal + i;
    const isEntryItem = globalIdx >= entryStartIdx && globalIdx < entryEndIdx;

    switch (item.kind) {
      case "blank":
        y += LAYOUT.lineHeight;
        break;

      case "line": {
        let charFraction = 1;
        if (isStreaming && isEntryItem) {
          if (entryLineIdx < Math.floor(revealLines)) {
            charFraction = 1;
          } else if (entryLineIdx === Math.floor(revealLines)) {
            charFraction = revealLines % 1;
          } else {
            charFraction = 0;
          }
          entryLineIdx++;
        }

        if (charFraction <= 0) {
          break;
        }

        let indent = (item.line.indent || 0) * LAYOUT.charWidth;

        // Full-line background (e.g. bash output)
        if (item.line.lineBgColor) {
          ctx.fillStyle = item.line.lineBgColor;
          const bgX = GEOMETRY.bodyLeft + indent - 4;
          const bgW = GEOMETRY.bodyMaxWidth - indent + 8;
          roundRect(ctx, bgX, y - LAYOUT.fontSize - 2, bgW, LAYOUT.lineHeight, 4);
          ctx.fill();
        }

        // Gutter indicator for assistant messages
        if (item.line.hasGutter) {
          const gx = GEOMETRY.bodyLeft + indent + LAYOUT.charWidth * 0.5;
          const gy = y - LAYOUT.fontSize - 2;
          const gh = LAYOUT.fontSize + 2;
          const gw = LAYOUT.charWidth * 0.6;
          ctx.strokeStyle = COLORS.text;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx, gy + gh);
          ctx.lineTo(gx + gw, gy + gh);
          ctx.stroke();
          indent += 3 * LAYOUT.charWidth;
        }

        let x = GEOMETRY.bodyLeft + indent;

        // Compute character limit from charFraction
        let totalLineChars = 0;
        for (const seg of item.line.segments) totalLineChars += seg.text.length;
        const charLimit = charFraction >= 1 ? Infinity : Math.floor(charFraction * totalLineChars);

        const fs = item.line.fontSize || LAYOUT.fontSize;
        let charsDrawn = 0;
        let lastFont = "";
        for (const seg of item.line.segments) {
          let segText = seg.text;
          if (charLimit < Infinity) {
            const remaining = charLimit - charsDrawn;
            if (remaining <= 0) break;
            if (segText.length > remaining) {
              segText = segText.slice(0, remaining);
            }
            charsDrawn += segText.length;
          }

          const segW = measureText(segText);
          if (seg.bgColor) {
            ctx.fillStyle = seg.bgColor;
            roundRect(ctx, x - 3, y - fs - 2, segW + 6, fs + 8, 3);
            ctx.fill();
          }
          const segFont = seg.bold ? font(fs, true) : font(fs);
          if (segFont !== lastFont) { ctx.font = segFont; lastFont = segFont; }
          ctx.fillStyle = seg.color;
          ctx.fillText(segText, x, y);
          x += segW;
        }

        // Draw cursor for user prompt typing effect
        if (isCurrentPrompt && isEntryItem && charFraction < 1) {
          ctx.fillStyle = COLORS.text;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(x, y - LAYOUT.fontSize - 2, LAYOUT.charWidth, LAYOUT.fontSize + 2);
          ctx.globalAlpha = 1;
        }

        y += LAYOUT.lineHeight;
        break;
      }

      case "toolbox": {
        y += LAYOUT.toolBoxMarginY;
        y = drawToolBox(ctx, item.box, GEOMETRY.bodyLeft + LAYOUT.charWidth * 2, y, GEOMETRY.bodyMaxWidth - LAYOUT.charWidth * 4);
        y += GEOMETRY.toolboxMarginBottom;
        break;
      }

      case "inline_tool": {
        const prevGlobal = globalIdx > 0 ? termState.items[globalIdx - 1] : null;
        const afterToolbox = prevGlobal?.kind === "toolbox";
        y = drawInlineTool(ctx, item.tool, GEOMETRY.bodyLeft, y, GEOMETRY.bodyMaxWidth, afterToolbox);
        break;
      }

      case "summary": {
        y = drawSummaryLine(ctx, item.summary, GEOMETRY.bodyLeft, y);
        break;
      }

      case "divider": {
        const lineY = y - LAYOUT.fontSize / 2 + LAYOUT.lineHeight / 2;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1;

        const text = item.text;

        if (!text.trim()) {
          ctx.beginPath();
          ctx.moveTo(GEOMETRY.bodyLeft + 20, lineY);
          ctx.lineTo(GEOMETRY.bodyLeft + GEOMETRY.bodyMaxWidth - 20, lineY);
          ctx.stroke();
          y += LAYOUT.lineHeight;
          break;
        }

        ctx.font = font(LAYOUT.fontSizeTitle);
        const tw = measureText(text);
        const divCx = GEOMETRY.bodyLeft + GEOMETRY.bodyMaxWidth / 2;

        ctx.beginPath();
        ctx.moveTo(GEOMETRY.bodyLeft + 20, lineY);
        ctx.lineTo(divCx - tw / 2 - 10, lineY);
        ctx.stroke();

        ctx.fillStyle = item.color;
        ctx.textAlign = "center";
        ctx.fillText(text, divCx, y);
        ctx.textAlign = "left";

        ctx.beginPath();
        ctx.moveTo(divCx + tw / 2 + 10, lineY);
        ctx.lineTo(GEOMETRY.bodyLeft + GEOMETRY.bodyMaxWidth - 20, lineY);
        ctx.stroke();

        y += LAYOUT.lineHeight;
        break;
      }
    }
  }
  ctx.restore();
}
