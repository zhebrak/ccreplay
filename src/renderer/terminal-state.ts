import { COLORS, LAYOUT } from "./theme.js";
import { parseAnsiSegments } from "../util/ansi.js";
import { parseMarkdownBlocks, renderMarkdownToItems } from "./markdown.js";
import type { TextSegment, RenderItem, ItemKind } from "./types.js";

export type { TextSegment, TerminalLine, ToolBox, InlineTool, SummaryLine, RenderItem, ItemKind } from "./types.js";

/** Max chars per line inside a toolbox. Derived from shared LAYOUT constants:
 *  termW = width - outerPadding*2, bodyMaxW = termW - innerPadding*2,
 *  toolbox gets bodyMaxW - charWidth*4 indent, minus toolBoxPadding*2 for content. */
const TOOLBOX_WRAP_CHARS = Math.floor(
  (LAYOUT.width - LAYOUT.outerPadding * 2 - LAYOUT.innerPadding * 2
    - LAYOUT.charWidth * 4 - LAYOUT.toolBoxPadding * 2) / LAYOUT.charWidth
);

function countWrappedLines(text: string, maxChars: number): number {
  let count = 0;
  for (const rawLine of text.split("\n")) {
    count += rawLine.length <= maxChars ? 1 : Math.ceil(rawLine.length / maxChars);
  }
  return Math.max(1, count);
}

export class TerminalState {
  items: RenderItem[] = [];
  entryBoundaries: number[] = [];
  visibleStartIdx: number = 0;
  private maxVisibleLines: number;
  private lastItemKind: ItemKind = "blank";
  private scrollOffset: number = 0;
  private targetScrollOffset: number = 0;
  private skippedLines: number = 0;
  private cumulativeLines: number[] = [];

  /** Pixel offset for the first visible item. Must be read after getVisibleItems(). */
  get scrollPixelOffset(): number {
    const scrollLines = Math.floor(this.scrollOffset);
    const fractional = this.scrollOffset - scrollLines;
    return (scrollLines - this.skippedLines + fractional) * LAYOUT.lineHeight;
  }

  constructor() {
    const termHeight = LAYOUT.height - LAYOUT.outerPadding * 2;
    const bodyHeight = termHeight - LAYOUT.titleBarHeight - LAYOUT.statusBarHeight - LAYOUT.innerPadding * 2;
    this.maxVisibleLines = Math.floor(bodyHeight / LAYOUT.lineHeight);
  }

  markEntryStart(): void {
    this.entryBoundaries.push(this.items.length);
  }

  addUserPrompt(text: string): void {
    this.ensureBlank();
    const contentIndent = 2;
    const promptIdx = this.items.length;
    const blocks = parseMarkdownBlocks(text.trimStart());
    this.items.push(...renderMarkdownToItems(blocks, contentIndent));

    // Retroactively add prompt prefix to first line item
    for (let gi = promptIdx; gi < this.items.length; gi++) {
      const item = this.items[gi];
      if (item.kind === "line") {
        item.line.indent = 0;
        item.line.segments.unshift({ text: "\u276F ", color: COLORS.claude, bold: true });
        break;
      }
    }

    this.items.push({ kind: "blank" });
    this.lastItemKind = "user_prompt";
  }

  addAssistantText(text: string): void {
    // 1 blank before only if previous wasn't already a blank
    if (this.lastItemKind !== "user_prompt" && this.lastItemKind !== "blank") {
      this.ensureBlank();
    }

    const contentIndent = 5; // all assistant content indented 5 chars (gutter line uses 2 + 3 shift)
    const gutterIdx = this.items.length;
    const blocks = parseMarkdownBlocks(text);
    this.items.push(...renderMarkdownToItems(blocks, contentIndent));

    // Retroactively set gutter char on first line item in this block
    for (let gi = gutterIdx; gi < this.items.length; gi++) {
      const item = this.items[gi];
      if (item.kind === "line") {
        item.line.hasGutter = true;
        // Only override indent for standard content lines, not code/tables
        if ((item.line.indent || 0) === contentIndent) {
          item.line.indent = 2; // gutter line at indent 2; renderer adds 3 more
        }
        break;
      }
    }

    // Trailing blank — relied on by addInlineTool() for spacing
    this.items.push({ kind: "blank" });
    this.lastItemKind = "assistant_text";
  }

  addToolBox(toolName: string, content: string, isError?: boolean, isSuccess?: boolean): void {
    const borderColor = toolName === "Bash" ? COLORS.bashBorder : COLORS.claude;
    this.items.push({
      kind: "toolbox",
      box: {
        toolName,
        content,
        borderColor,
        hasError: isError,
        hasSuccess: isSuccess,
        contentLineCount: countWrappedLines(content, TOOLBOX_WRAP_CHARS),
      },
    });
    this.lastItemKind = "toolbox";
  }

  addInlineTool(name: string, text: string, accentColor: string, status?: "ok" | "error"): void {
    // No blanks between consecutive inline tools
    // No blank before first inline tool after text (text's trailing blank provides gap)
    this.items.push({
      kind: "inline_tool",
      tool: { toolName: name, content: text, accentColor, status },
    });
    this.lastItemKind = "inline_tool";
  }

  addSummaryLine(text: string): void {
    // No blanks before/after summary lines
    this.items.push({
      kind: "summary",
      summary: { text },
    });
    this.lastItemKind = "summary";
  }

  addCompaction(): void {
    this.items.push({
      kind: "divider",
      text: " context compacted ",
      color: COLORS.subtle,
    });
    this.items.push({ kind: "blank" });
    this.lastItemKind = "divider";
  }

  addGap(text: string): void {
    this.items.push({
      kind: "divider",
      text: ` ${text} `,
      color: COLORS.subtle,
    });
    this.lastItemKind = "divider";
  }

  addToolOutput(text: string): void {
    // Show 1-2 lines of ANSI-parsed output, indented deeper than inline tools
    const lines = text.split("\n").filter(l => l.trim()).slice(0, 2);
    for (const line of lines) {
      const segments = parseAnsiSegments(line);
      this.items.push({
        kind: "line",
        line: { segments, indent: 4, lineBgColor: COLORS.bashMessageBg },
      });
    }
    this.lastItemKind = "other";
  }

  /** Ensure there's a trailing blank line */
  private ensureBlank(): void {
    if (this.items.length === 0 || this.items[this.items.length - 1].kind !== "blank") {
      this.items.push({ kind: "blank" });
    }
  }

  private updateCumulativeLines(): void {
    while (this.cumulativeLines.length < this.items.length) {
      const i = this.cumulativeLines.length;
      const prev = i > 0 ? this.cumulativeLines[i - 1] : 0;
      this.cumulativeLines.push(prev + this.itemLineCount(this.items[i], i));
    }
  }

  advanceScroll(linesPerFrame: number, hiddenLines: number = 0): void {
    this.updateCumulativeLines();
    const totalLines = this.cumulativeLines.length > 0
      ? this.cumulativeLines[this.cumulativeLines.length - 1] : 0;
    const effectiveTotal = totalLines - hiddenLines;
    const rawTarget = Math.max(0, effectiveTotal - this.maxVisibleLines);

    // Ratchet: target only increases (prevents jitter from hiddenLines fluctuation)
    this.targetScrollOffset = Math.max(this.targetScrollOffset, rawTarget);

    if (this.scrollOffset < this.targetScrollOffset) {
      this.scrollOffset = Math.min(
        this.targetScrollOffset,
        this.scrollOffset + linesPerFrame
      );
    } else if (this.scrollOffset > this.targetScrollOffset) {
      this.scrollOffset = Math.max(
        this.targetScrollOffset,
        this.scrollOffset - linesPerFrame
      );
    }
  }

  /** Get the visible window of items, scroll-aware */
  getVisibleItems(): RenderItem[] {
    this.updateCumulativeLines();
    const scrollLines = Math.floor(this.scrollOffset);

    // Binary search: find first index where cumulative > scrollLines
    let lo = 0, hi = this.cumulativeLines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulativeLines[mid] <= scrollLines) lo = mid + 1;
      else hi = mid;
    }
    const startIdx = lo;
    const skipped = startIdx > 0 ? this.cumulativeLines[startIdx - 1] : 0;

    this.visibleStartIdx = startIdx;
    this.skippedLines = skipped;

    // Collect items filling viewport
    const result: RenderItem[] = [];
    let count = 0;
    for (let i = startIdx; i < this.items.length; i++) {
      const lc = this.itemLineCount(this.items[i], i);
      if (count + lc > this.maxVisibleLines + 1) break; // +1: extra item for sub-pixel scroll, clipped by body rect
      result.push(this.items[i]);
      count += lc;
    }
    return result;
  }

  private itemLineCount(item: RenderItem, idx?: number): number {
    switch (item.kind) {
      case "line": return 1;
      case "blank": return 1;
      case "divider": return 1;
      case "toolbox": return item.box.contentLineCount + 2; // header + content lines + bottom margin
      case "inline_tool": {
        // Border line is skipped when preceded by a toolbox
        if (idx !== undefined && idx > 0 && this.items[idx - 1].kind === "toolbox") return 1;
        return 2;
      }
      case "summary": return 1;
    }
  }
}
