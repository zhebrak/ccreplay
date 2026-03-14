import { COLORS, ANSI_COLORS } from "../renderer/theme.js";

export interface TextSegment {
  text: string;
  color: string;
  bold?: boolean;
  bgColor?: string;
}

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

export function truncateAnsiAware(content: string): { text: string; rawContent: string } {
  // rawContent: truncated but ANSI preserved (for rendering)
  // text: ANSI-stripped (for word count, budgets, display text)
  let raw = content;
  let text = stripAnsi(content);

  // Strip persisted-output tags and truncate
  if (text.includes("<persisted-output>")) {
    const matchRaw = raw.match(/Preview \(first [^)]+\):\n([\s\S]{0,200})/);
    const matchText = text.match(/Preview \(first [^)]+\):\n([\s\S]{0,200})/);
    return {
      text: matchText ? matchText[1].trim() : "(large output)",
      rawContent: matchRaw ? matchRaw[1].trim() : "(large output)",
    };
  }
  if (text.length > 200) {
    // Truncate raw at roughly the same point (may be slightly off due to ANSI codes)
    // Find position in raw that corresponds to 200 chars of visible text
    let visibleCount = 0;
    let rawPos = 0;
    const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;
    let lastIndex = 0;
    let match;
    ansiRegex.lastIndex = 0;
    while ((match = ansiRegex.exec(raw)) !== null) {
      // Count visible chars before this escape
      const chunkLen = match.index - lastIndex;
      if (visibleCount + chunkLen >= 200) {
        rawPos = lastIndex + (200 - visibleCount);
        break;
      }
      visibleCount += chunkLen;
      lastIndex = match.index + match[0].length;
    }
    if (rawPos === 0) {
      // No more escapes, just count remaining
      rawPos = lastIndex + (200 - visibleCount);
    }
    return {
      text: text.slice(0, 200) + "\u2026",
      rawContent: raw.slice(0, rawPos) + "\u2026",
    };
  }
  return { text, rawContent: raw };
}

export function parseAnsiSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let currentColor: string = COLORS.text;
  let currentBold = false;

  // Split on ANSI escape sequences
  const parts = text.split(/(\x1B\[[0-9;]*m)/);
  for (const part of parts) {
    const sgrMatch = part.match(/^\x1B\[([0-9;]*)m$/);
    if (sgrMatch) {
      const codes = sgrMatch[1].split(";").map(Number);
      for (const code of codes) {
        if (code === 0) {
          currentColor = COLORS.text;
          currentBold = false;
        } else if (code === 1) {
          currentBold = true;
        } else if (ANSI_COLORS[code]) {
          currentColor = ANSI_COLORS[code];
        }
      }
      continue;
    }

    // Strip any other escape sequences
    const cleaned = stripAnsi(part);
    if (cleaned) {
      segments.push({ text: cleaned, color: currentColor, bold: currentBold || undefined });
    }
  }

  if (segments.length === 0) {
    segments.push({ text, color: COLORS.text });
  }
  return segments;
}
