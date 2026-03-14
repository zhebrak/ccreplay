import { COLORS, LAYOUT } from "./theme.js";
import { highlightCode } from "./syntax-highlight.js";
import type { TextSegment, RenderItem } from "./types.js";

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; num: string; text: string }
  | { type: "code"; lines: string[]; lang?: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; rows: string[][]; hasHeader: boolean }
  | { type: "hr" }
  | { type: "blank" };

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const rawLines = text.split("\n");
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Code block fences
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trimStart().startsWith("```")) {
        codeLines.push(rawLines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lines: codeLines, lang });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Bullet list item
    if (line.match(/^[-*]\s+/)) {
      blocks.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "") });
      i++;
      continue;
    }

    // Numbered list item
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      blocks.push({ type: "numbered", num: numMatch[1], text: numMatch[2] });
      i++;
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      const rows: string[][] = [];
      let hasHeader = false;

      while (i < rawLines.length && rawLines[i].trim().startsWith("|")) {
        const row = rawLines[i];
        if (row.match(/^\s*\|[\s\-:]+(\|[\s\-:]+)+\|?\s*$/)) {
          hasHeader = rows.length > 0;
          i++;
          continue;
        }
        const cells = row.split("|").map(c => c.trim());
        if (cells[0] === "") cells.shift();
        if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
        rows.push(cells);
        i++;
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", rows, hasHeader });
      }
      continue;
    }

    // Blank line
    if (!line.trim()) {
      blocks.push({ type: "blank" });
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    let paraText = line;
    i++;
    while (i < rawLines.length) {
      const next = rawLines[i];
      if (!next.trim() || next.trimStart().startsWith("```") || next.match(/^#{1,6}\s+/) ||
          next.match(/^[-*]\s+/) || next.match(/^\d+\.\s+/) ||
          next.match(/^[-*_]{3,}\s*$/) || (next.includes("|") && next.trim().startsWith("|"))) {
        break;
      }
      paraText += " " + next;
      i++;
    }
    blocks.push({ type: "paragraph", text: paraText });
  }

  return blocks;
}

function segmentsVisualLength(segments: TextSegment[]): number {
  let len = 0;
  for (const s of segments) len += s.text.length;
  return len;
}

function truncateSegments(segments: TextSegment[], maxLen: number): TextSegment[] {
  const result: TextSegment[] = [];
  let remaining = maxLen;
  for (const seg of segments) {
    if (remaining <= 0) break;
    if (seg.text.length <= remaining) {
      result.push({ ...seg });
      remaining -= seg.text.length;
    } else {
      result.push({ ...seg, text: seg.text.slice(0, remaining) });
      remaining = 0;
    }
  }
  return result;
}

export function renderMarkdownToItems(blocks: MarkdownBlock[], contentIndent: number): RenderItem[] {
  const items: RenderItem[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const cleanText = block.text.replace(/\*\*/g, "").replace(/`/g, "");
        const wrapped = wrapText(cleanText, LAYOUT.maxCharsPerLine - contentIndent);
        for (const line of wrapped) {
          const fontSize = block.level === 1 ? LAYOUT.fontSizeLarge : undefined;
          items.push({
            kind: "line",
            line: { segments: [{ text: line, color: COLORS.claude, bold: true }], indent: contentIndent, fontSize },
          });
        }
        items.push({ kind: "blank" });
        break;
      }
      case "bullet": {
        const wrappedLines = wrapFormattedText(block.text, LAYOUT.maxCharsPerLine - contentIndent - 3);
        for (let i = 0; i < wrappedLines.length; i++) {
          const segments = wrappedLines[i];
          segments.unshift({ text: i === 0 ? "\u2022  " : "   ", color: COLORS.text });
          items.push({
            kind: "line",
            line: { segments, indent: contentIndent },
          });
        }
        break;
      }
      case "numbered": {
        const wrappedLines = wrapFormattedText(block.text, LAYOUT.maxCharsPerLine - contentIndent - 3);
        for (let i = 0; i < wrappedLines.length; i++) {
          const segments = wrappedLines[i];
          segments.unshift({ text: i === 0 ? `${block.num}. ` : "   ", color: COLORS.text });
          items.push({
            kind: "line",
            line: { segments, indent: contentIndent },
          });
        }
        break;
      }
      case "code": {
        for (const codeLine of block.lines) {
          const truncated = codeLine.slice(0, LAYOUT.maxCharsPerLine - contentIndent - 2);
          const segments = highlightCode(truncated, block.lang);
          items.push({
            kind: "line",
            line: { segments, indent: contentIndent + 2, lineBgColor: COLORS.codeBg },
          });
        }
        items.push({ kind: "blank" });
        break;
      }
      case "table": {
        if (block.rows.length === 0) break;
        const numCols = Math.max(...block.rows.map(r => r.length));

        // Pre-parse all cells and cache formatted segments
        const parsedCells: TextSegment[][][] = block.rows.map(row => {
          const parsed: TextSegment[][] = [];
          for (let c = 0; c < numCols; c++) {
            parsed.push(parseInlineFormatting(row[c] || ""));
          }
          return parsed;
        });

        // Compute column widths from visual (post-formatting) lengths
        const colWidths: number[] = new Array(numCols).fill(0);
        for (let r = 0; r < parsedCells.length; r++) {
          for (let c = 0; c < numCols; c++) {
            colWidths[c] = Math.max(colWidths[c], segmentsVisualLength(parsedCells[r][c]));
          }
        }

        const padding = 2;
        const indent = contentIndent + 2;
        let totalWidth = colWidths.reduce((s, w) => s + w, 0) + padding * (numCols - 1);
        const maxWidth = LAYOUT.maxCharsPerLine - indent;
        if (totalWidth > maxWidth) {
          const scale = maxWidth / totalWidth;
          for (let c = 0; c < numCols; c++) {
            colWidths[c] = Math.max(3, Math.floor(colWidths[c] * scale));
          }
        }

        for (let r = 0; r < block.rows.length; r++) {
          const isHeaderRow = block.hasHeader && r === 0;
          const segments: TextSegment[] = [];

          for (let c = 0; c < numCols; c++) {
            // Truncate segments to column width
            const rawSegs = truncateSegments(parsedCells[r][c], colWidths[c]);
            const cellSegs = isHeaderRow
              ? rawSegs.map(s => ({ ...s, bold: true as const }))
              : rawSegs;
            const visLen = segmentsVisualLength(cellSegs);
            const padLen = colWidths[c] - visLen;

            segments.push(...cellSegs);
            if (padLen > 0) {
              segments.push({ text: " ".repeat(padLen), color: COLORS.text });
            }
            if (c < numCols - 1) {
              segments.push({ text: "  ", color: COLORS.text });
            }
          }

          items.push({
            kind: "line",
            line: { segments, indent },
          });

          if (isHeaderRow) {
            let sep = "";
            for (let c = 0; c < numCols; c++) {
              sep += "\u2500".repeat(colWidths[c]);
              if (c < numCols - 1) sep += "\u2500\u2500";
            }
            items.push({
              kind: "line",
              line: { segments: [{ text: sep, color: COLORS.subtle }], indent },
            });
          }
        }
        items.push({ kind: "blank" });
        break;
      }
      case "hr":
        items.push({ kind: "divider", text: "", color: COLORS.subtle });
        break;
      case "paragraph": {
        const wrappedLines = wrapFormattedText(block.text, LAYOUT.maxCharsPerLine - contentIndent);
        for (const lineSegments of wrappedLines) {
          items.push({
            kind: "line",
            line: { segments: lineSegments, indent: contentIndent },
          });
        }
        break;
      }
      case "blank":
        items.push({ kind: "blank" });
        break;
    }
  }

  return items;
}

export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= maxWidth) {
      lines.push(rawLine);
    } else {
      // Word wrap
      const words = rawLine.split(/(\s+)/);
      let current = "";
      for (const word of words) {
        if (current.length + word.length > maxWidth && current.length > 0) {
          lines.push(current);
          current = word.trimStart();
        } else {
          current += word;
        }
      }
      if (current) lines.push(current);
    }
  }
  return lines.length > 0 ? lines : [""];
}

export function wrapFormattedText(text: string, maxWidth: number): TextSegment[][] {
  const segments = parseInlineFormatting(text);
  const lines: TextSegment[][] = [];
  let currentLine: TextSegment[] = [];
  let currentWidth = 0;

  for (const seg of segments) {
    const parts = seg.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (currentWidth + part.length > maxWidth && currentWidth > 0) {
        lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
        if (/^\s+$/.test(part)) continue;
      }
      const last = currentLine.length > 0 ? currentLine[currentLine.length - 1] : null;
      if (last && last.color === seg.color && !!last.bold === !!seg.bold && last.bgColor === seg.bgColor) {
        last.text += part;
      } else {
        currentLine.push({ text: part, color: seg.color, bold: seg.bold, bgColor: seg.bgColor });
      }
      currentWidth += part.length;
    }
  }

  if (currentLine.length > 0) lines.push(currentLine);
  return lines.length > 0 ? lines : [[{ text: "", color: COLORS.text }]];
}

export function parseInlineFormatting(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let i = 0;
  let plain = "";

  const flush = () => {
    if (plain) {
      segments.push({ text: plain, color: COLORS.text });
      plain = "";
    }
  };

  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const close = text.indexOf("**", i + 2);
      if (close > i + 2) {
        flush();
        const boldContent = text.slice(i + 2, close);
        // Parse backtick code spans within bold text
        let bi = 0;
        let boldPlain = "";
        const flushBold = () => {
          if (boldPlain) {
            segments.push({ text: boldPlain, color: COLORS.text, bold: true });
            boldPlain = "";
          }
        };
        while (bi < boldContent.length) {
          if (boldContent[bi] === "`") {
            const bclose = boldContent.indexOf("`", bi + 1);
            if (bclose > bi) {
              flushBold();
              segments.push({ text: boldContent.slice(bi + 1, bclose), color: COLORS.text, bold: true, bgColor: COLORS.codeBg });
              bi = bclose + 1;
              continue;
            }
          }
          boldPlain += boldContent[bi];
          bi++;
        }
        flushBold();
        i = close + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i) {
        flush();
        segments.push({ text: text.slice(i + 1, close), color: COLORS.text, bgColor: COLORS.codeBg });
        i = close + 1;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  flush();

  if (segments.length === 0) {
    segments.push({ text, color: COLORS.text });
  }
  return segments;
}
