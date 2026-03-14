import { describe, it, expect, beforeAll } from "vitest";
import { stripAnsi, truncateAnsiAware, parseAnsiSegments } from "../src/util/ansi.js";
import { COLORS, initTheme } from "../src/renderer/theme.js";
import { resolveConfig } from "../src/config/resolve.js";

beforeAll(() => {
  initTheme(resolveConfig({}));
});

describe("stripAnsi", () => {
  it("removes color codes", () => {
    expect(stripAnsi("\x1B[31mred\x1B[0m")).toBe("red");
  });

  it("removes multiple codes", () => {
    expect(stripAnsi("\x1B[1m\x1B[32mbold green\x1B[0m")).toBe("bold green");
  });

  it("clean string is unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});

describe("truncateAnsiAware", () => {
  it("short string passes through", () => {
    const result = truncateAnsiAware("hello");
    expect(result.text).toBe("hello");
    expect(result.rawContent).toBe("hello");
  });

  it("long string truncated at 200 visible chars", () => {
    const long = "a".repeat(250);
    const result = truncateAnsiAware(long);
    expect(result.text).toBe("a".repeat(200) + "\u2026");
  });

  it("extracts persisted-output preview", () => {
    const content = "<persisted-output>\nPreview (first 100 bytes):\nhello world";
    const result = truncateAnsiAware(content);
    expect(result.text).toBe("hello world");
  });

  it("preserves ANSI in rawContent for short strings", () => {
    const content = "\x1B[31mred\x1B[0m text";
    const result = truncateAnsiAware(content);
    expect(result.rawContent).toBe(content);
    expect(result.text).toBe("red text");
  });
});

describe("parseAnsiSegments", () => {
  it("plain text returns default color", () => {
    const segments = parseAnsiSegments("hello");
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("hello");
    expect(segments[0].color).toBe(COLORS.text);
  });

  it("red ANSI code produces colored segment", () => {
    const segments = parseAnsiSegments("\x1B[31mred text\x1B[0m");
    expect(segments.length).toBeGreaterThanOrEqual(1);
    const redSeg = segments.find(s => s.text === "red text");
    expect(redSeg).toBeDefined();
    expect(redSeg!.color).not.toBe(COLORS.text);
  });

  it("bold flag is set", () => {
    const segments = parseAnsiSegments("\x1B[1mbold\x1B[0m");
    const boldSeg = segments.find(s => s.text === "bold");
    expect(boldSeg).toBeDefined();
    expect(boldSeg!.bold).toBe(true);
  });

  it("reset mid-string reverts to default", () => {
    const segments = parseAnsiSegments("\x1B[31mred\x1B[0m normal");
    expect(segments.length).toBe(2);
    expect(segments[1].color).toBe(COLORS.text);
  });

  it("empty input returns single segment", () => {
    const segments = parseAnsiSegments("");
    expect(segments).toHaveLength(1);
  });

  it("multiple colored segments", () => {
    const segments = parseAnsiSegments("\x1B[31mred\x1B[32mgreen\x1B[0m");
    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe("red");
    expect(segments[1].text).toBe("green");
    expect(segments[0].color).not.toBe(segments[1].color);
  });
});
