import { describe, it, expect, beforeAll } from "vitest";
import { highlightCode } from "../src/renderer/syntax-highlight.js";
import { HIGHLIGHT_COLORS, initTheme } from "../src/renderer/theme.js";
import { resolveConfig } from "../src/config/resolve.js";

beforeAll(() => {
  initTheme(resolveConfig({}));
});

describe("highlightCode", () => {
  it("JS keywords get keyword color", () => {
    const segments = highlightCode("const x = 5");
    const kwSeg = segments.find(s => s.text === "const");
    expect(kwSeg).toBeDefined();
    expect(kwSeg!.color).toBe(HIGHLIGHT_COLORS.keyword);
  });

  it("numbers get number color", () => {
    const segments = highlightCode("const x = 5");
    const numSeg = segments.find(s => s.text === "5");
    expect(numSeg).toBeDefined();
    expect(numSeg!.color).toBe(HIGHLIGHT_COLORS.number);
  });

  it("Python keywords with lang=python", () => {
    const segments = highlightCode("def foo():", "python");
    const kwSeg = segments.find(s => s.text === "def");
    expect(kwSeg).toBeDefined();
    expect(kwSeg!.color).toBe(HIGHLIGHT_COLORS.keyword);
  });

  it("Bash keywords with lang=bash", () => {
    const segments = highlightCode("echo hello", "bash");
    const kwSeg = segments.find(s => s.text === "echo");
    expect(kwSeg).toBeDefined();
    expect(kwSeg!.color).toBe(HIGHLIGHT_COLORS.keyword);
  });

  it("double-quoted string", () => {
    const segments = highlightCode('"hello world"');
    const strSeg = segments.find(s => s.text === '"hello world"');
    expect(strSeg).toBeDefined();
    expect(strSeg!.color).toBe(HIGHLIGHT_COLORS.string);
  });

  it("single-quoted string", () => {
    const segments = highlightCode("'hello'");
    const strSeg = segments.find(s => s.text === "'hello'");
    expect(strSeg).toBeDefined();
    expect(strSeg!.color).toBe(HIGHLIGHT_COLORS.string);
  });

  it("backtick string", () => {
    const segments = highlightCode("`template`");
    const strSeg = segments.find(s => s.text === "`template`");
    expect(strSeg).toBeDefined();
    expect(strSeg!.color).toBe(HIGHLIGHT_COLORS.string);
  });

  it("JS comment // consumes rest of line", () => {
    const segments = highlightCode("x = 1 // comment");
    const commentSeg = segments.find(s => s.color === HIGHLIGHT_COLORS.comment);
    expect(commentSeg).toBeDefined();
    expect(commentSeg!.text).toBe("// comment");
  });

  it("Python comment # with lang=python", () => {
    const segments = highlightCode("x = 1 # comment", "python");
    const commentSeg = segments.find(s => s.color === HIGHLIGHT_COLORS.comment);
    expect(commentSeg).toBeDefined();
    expect(commentSeg!.text).toBe("# comment");
  });

  it("capitalized word gets type color", () => {
    const segments = highlightCode("new MyClass()");
    const typeSeg = segments.find(s => s.text === "MyClass");
    expect(typeSeg).toBeDefined();
    expect(typeSeg!.color).toBe(HIGHLIGHT_COLORS.type);
  });

  it("hex number", () => {
    const segments = highlightCode("x = 0xFF");
    const numSeg = segments.find(s => s.color === HIGHLIGHT_COLORS.number);
    expect(numSeg).toBeDefined();
    expect(numSeg!.text).toBe("0xFF");
  });

  it("plain text gets plain color", () => {
    const segments = highlightCode("hello");
    expect(segments).toHaveLength(1);
    expect(segments[0].color).toBe(HIGHLIGHT_COLORS.plain);
  });

  it("empty line returns single plain segment", () => {
    const segments = highlightCode("");
    expect(segments).toHaveLength(1);
    expect(segments[0].color).toBe(HIGHLIGHT_COLORS.plain);
  });
});
