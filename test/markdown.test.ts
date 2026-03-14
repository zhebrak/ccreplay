import { describe, it, expect } from "vitest";
import {
  parseMarkdownBlocks,
  renderMarkdownToItems,
} from "../src/renderer/markdown.js";
import { initTheme } from "../src/renderer/theme.js";
import { resolveConfig } from "../src/config/resolve.js";
import type { TextSegment, RenderItem } from "../src/renderer/types.js";

// Initialize theme so COLORS/LAYOUT are available
initTheme(resolveConfig({}));

/** Extract all text segments from a line-kind RenderItem */
function lineSegments(item: RenderItem): TextSegment[] {
  if (item.kind !== "line") throw new Error("expected line item");
  return item.line.segments;
}

/** Compute total visual width of segments */
function visualWidth(segments: TextSegment[]): number {
  return segments.reduce((sum, s) => sum + s.text.length, 0);
}

/** Render a markdown table string and return the line items (excluding blanks) */
function renderTable(md: string): RenderItem[] {
  const blocks = parseMarkdownBlocks(md);
  const items = renderMarkdownToItems(blocks, 0);
  return items.filter(i => i.kind === "line");
}

describe("table column alignment", () => {
  it("aligns rows with backtick-formatted cells to the same width as the header", () => {
    const md = [
      "| Name   | Value   |",
      "|--------|---------|",
      "| plain  | text    |",
      "| `code` | another |",
    ].join("\n");

    const lines = renderTable(md);
    // lines: header, separator, row1, row2
    expect(lines.length).toBe(4);

    const headerWidth = visualWidth(lineSegments(lines[0]));
    const row1Width = visualWidth(lineSegments(lines[2]));
    const row2Width = visualWidth(lineSegments(lines[3]));

    expect(row1Width).toBe(headerWidth);
    expect(row2Width).toBe(headerWidth);
  });

  it("aligns rows with bold-formatted cells", () => {
    const md = [
      "| Col A      | Col B   |",
      "|------------|---------|",
      "| **bold**   | normal  |",
      "| plain      | **yes** |",
    ].join("\n");

    const lines = renderTable(md);
    expect(lines.length).toBe(4);

    const headerWidth = visualWidth(lineSegments(lines[0]));
    const row1Width = visualWidth(lineSegments(lines[2]));
    const row2Width = visualWidth(lineSegments(lines[3]));

    expect(row1Width).toBe(headerWidth);
    expect(row2Width).toBe(headerWidth);
  });

  it("does not merge formatting across cell boundaries", () => {
    // Cell 1 ends with backtick char, cell 2 starts with backtick char
    // These should NOT be parsed as a single code span
    const md = [
      "| A    | B    |",
      "|------|------|",
      "| foo` | `bar |",
    ].join("\n");

    const lines = renderTable(md);
    const dataRow = lineSegments(lines[2]);

    // The backtick characters should appear as literal text (not stripped as code markers)
    const allText = dataRow.map(s => s.text).join("");
    expect(allText).toContain("`");
  });

  it("applies bold to all header segments", () => {
    const md = [
      "| Name   | Value |",
      "|--------|-------|",
      "| foo    | bar   |",
    ].join("\n");

    const lines = renderTable(md);
    const headerSegs = lineSegments(lines[0]);

    // All non-whitespace-only segments with cell content should be bold
    const contentSegs = headerSegs.filter(s => s.text.trim().length > 0);
    for (const seg of contentSegs) {
      expect(seg.bold).toBe(true);
    }
  });

  it("handles empty/missing cells", () => {
    const md = [
      "| A     | B     | C     |",
      "|-------|-------|-------|",
      "| only  |",
      "| x     | y     | z     |",
    ].join("\n");

    const lines = renderTable(md);
    const headerWidth = visualWidth(lineSegments(lines[0]));
    // Row with missing cells should still have full width
    const shortRowWidth = visualWidth(lineSegments(lines[2]));
    const fullRowWidth = visualWidth(lineSegments(lines[3]));

    expect(shortRowWidth).toBe(headerWidth);
    expect(fullRowWidth).toBe(headerWidth);
  });

  it("aligns rows in tables without a header", () => {
    // No separator row → hasHeader = false
    const md = [
      "| alpha   | `beta` |",
      "| gamma   | delta  |",
    ].join("\n");

    const lines = renderTable(md);
    expect(lines.length).toBe(2);

    const row0Width = visualWidth(lineSegments(lines[0]));
    const row1Width = visualWidth(lineSegments(lines[1]));
    expect(row0Width).toBe(row1Width);
  });

  it("aligns rows when table is scaled down due to overflow", () => {
    // Create a very wide table that will trigger the scaling path
    const longA = "a".repeat(60);
    const longB = "b".repeat(60);
    const md = [
      `| ${longA} | ${longB} |`,
      `|${"-".repeat(62)}|${"-".repeat(62)}|`,
      `| \`code\` | plain |`,
      `| **bold text** | short |`,
    ].join("\n");

    const lines = renderTable(md);
    // header, separator, row1, row2
    expect(lines.length).toBe(4);

    const headerWidth = visualWidth(lineSegments(lines[0]));
    const row1Width = visualWidth(lineSegments(lines[2]));
    const row2Width = visualWidth(lineSegments(lines[3]));

    expect(row1Width).toBe(headerWidth);
    expect(row2Width).toBe(headerWidth);
  });

  it("produces identical output for plain tables (no formatting)", () => {
    const md = [
      "| Name  | Age |",
      "|-------|-----|",
      "| Alice | 30  |",
      "| Bob   | 25  |",
    ].join("\n");

    const lines = renderTable(md);
    expect(lines.length).toBe(4);

    const headerWidth = visualWidth(lineSegments(lines[0]));
    const row1Width = visualWidth(lineSegments(lines[2]));
    const row2Width = visualWidth(lineSegments(lines[3]));

    expect(row1Width).toBe(headerWidth);
    expect(row2Width).toBe(headerWidth);
  });
});
