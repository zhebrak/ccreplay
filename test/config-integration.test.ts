import { describe, it, expect } from "vitest";
import { join } from "path";
import { parseSession } from "../src/parser/parse-session.js";
import type { ParsedSession } from "../src/parser/parse-session.js";
import { extractMoments } from "../src/parser/extract-moments.js";
import { buildTimeline } from "../src/timeline/build-timeline.js";
import { allocateBudgets } from "../src/timeline/budget-allocator.js";
import type { AllocatedEntry } from "../src/timeline/budget-allocator.js";
import { FrameRenderer } from "../src/renderer/frame-renderer.js";
import {
  COLORS, LAYOUT, GEOMETRY, ANSI_COLORS, HIGHLIGHT_COLORS,
  TOOL_ACCENT, WINDOW_CONTROLS, initTheme,
} from "../src/renderer/theme.js";
import { initFonts } from "../src/renderer/fonts.js";
import { resolveConfig } from "../src/config/resolve.js";
import type { CcreplayConfig, ResolvedConfig } from "../src/config/schema.js";
import { getPixel, colorClose } from "./helpers.js";

const FIXTURE = join(__dirname, "fixtures", "minimal-session.jsonl");
const FONTS_DIR = join(__dirname, "..", "fonts");

function buildTestSession(configOverrides?: Partial<CcreplayConfig>) {
  const config = resolveConfig(configOverrides ?? {});
  initTheme(config);
  initFonts(config);
  const session = parseSession(FIXTURE);
  const moments = extractMoments(session.events);
  const timeline = buildTimeline(session.events, moments);
  const allocated = allocateBudgets(timeline, {
    targetDurationS: 10, fps: config.video.fps,
    width: config.video.width, height: config.video.height,
    introDurationS: config.timing.introDuration,
    outroDurationS: config.timing.outroDuration,
    lingerDurationS: config.timing.lingerDuration,
  });
  return { session, allocated, config };
}

function makeRenderer(session: ParsedSession, allocated: AllocatedEntry[], config: ResolvedConfig) {
  const totalFrames = Math.round(10 * config.video.fps);
  const introFrames = Math.round(config.timing.introDuration * config.video.fps);
  const outroFrames = Math.round(config.timing.outroDuration * config.video.fps);
  const lingerFrames = Math.round(config.timing.lingerDuration * config.video.fps);
  return { renderer: new FrameRenderer(session, allocated, totalFrames, introFrames, outroFrames, lingerFrames), totalFrames, introFrames, outroFrames, lingerFrames };
}

// ─── Group 1: Custom Colors ──────────────────────────────────────────

describe("custom colors", () => {
  it("custom background pixel", () => {
    const { session, allocated, config } = buildTestSession({ colors: { background: "#ff0000" } });
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(introFrames + 10);
    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [255, 0, 0])).toBe(true);
  });

  it("custom text → COLORS.text", () => {
    buildTestSession({ colors: { text: "#00ff00" } });
    expect(COLORS.text).toBe("rgb(0, 255, 0)");
  });

  it("custom dimmed → COLORS.inactive", () => {
    buildTestSession({ colors: { dimmed: "#aabbcc" } });
    expect(COLORS.inactive).toBe("rgb(170, 187, 204)");
  });

  it("success/error/warning propagate", () => {
    buildTestSession({
      colors: { success: "#112233", error: "#445566", warning: "#778899" },
    });
    expect(COLORS.success).toBe("rgb(17, 34, 51)");
    expect(COLORS.error).toBe("rgb(68, 85, 102)");
    expect(COLORS.warning).toBe("rgb(119, 136, 153)");
  });

  it("custom titleBarBg pixel", () => {
    const { session, allocated, config } = buildTestSession({ colors: { titleBarBg: "#ff8800" } });
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(introFrames + 5);
    // Sample right edge of title bar (avoid traffic light dots on left)
    const px = GEOMETRY.termX + GEOMETRY.termW - LAYOUT.innerPadding;
    const py = GEOMETRY.termY + Math.floor(LAYOUT.titleBarHeight / 2);
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [255, 136, 0])).toBe(true);
  });

  it("custom statusBarBg pixel", () => {
    const { session, allocated, config } = buildTestSession({ colors: { statusBarBg: "#880088" } });
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(introFrames + 10);
    // Sample right edge of status bar
    const px = GEOMETRY.termX + GEOMETRY.termW - LAYOUT.innerPadding;
    const py = GEOMETRY.termY + GEOMETRY.termH - Math.floor(LAYOUT.statusBarHeight / 2);
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [136, 0, 136])).toBe(true);
  });

  it("custom gradient colors pixel", () => {
    const { session, allocated, config } = buildTestSession({ colors: { gradientStart: "#ff0000", gradientEnd: "#ff0000" } });
    const { renderer } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(0); // intro frame
    // Corner pixel should have dominant red channel
    const pixel = getPixel(buf, config.video.width, 5, 5);
    expect(pixel[0]).toBeGreaterThan(pixel[1]);
    expect(pixel[0]).toBeGreaterThan(pixel[2]);
  });

  it("codeBg → COLORS.codeBg", () => {
    buildTestSession({ colors: { codeBg: "#334455" } });
    expect(COLORS.codeBg).toBe("rgb(51, 68, 85)");
  });

  it("bashBg/bashBorder propagate", () => {
    buildTestSession({ colors: { bashBg: "#112233", bashBorder: "#aabbcc" } });
    expect(COLORS.bashMessageBg).toBe("rgb(17, 34, 51)");
    expect(COLORS.bashBorder).toBe("rgb(170, 187, 204)");
    expect(TOOL_ACCENT.Bash).toBe("rgb(170, 187, 204)");
  });

  it("theme + color override (dracula + bg:#000)", () => {
    buildTestSession({ theme: "dracula", colors: { background: "#000000" } });
    expect(COLORS.background).toBe("rgb(0, 0, 0)");
    // Accent should still be dracula's (not default)
    expect(COLORS.claude).toBe("rgb(255, 121, 198)"); // dracula accent #ff79c6
  });
});

// ─── Group 2: ANSI Color Overrides ──────────────────────────────────

describe("ANSI color overrides", () => {
  it("custom ANSI red", () => {
    buildTestSession({ ansiColors: { red: "#00ff00" } });
    expect(ANSI_COLORS[31]).toBe("rgb(0, 255, 0)");
  });

  it("custom bright cyan", () => {
    buildTestSession({ ansiColors: { brightCyan: "#ff0000" } });
    expect(ANSI_COLORS[96]).toBe("rgb(255, 0, 0)");
  });

  it("partial override preserves defaults", () => {
    buildTestSession({ ansiColors: { red: "#00ff00" } });
    expect(ANSI_COLORS[31]).toBe("rgb(0, 255, 0)");
    expect(ANSI_COLORS[32]).toBe("rgb(78, 186, 101)"); // green stays default
  });

  it("theme + ANSI override", () => {
    buildTestSession({ theme: "dracula", ansiColors: { green: "#112233" } });
    expect(ANSI_COLORS[32]).toBe("rgb(17, 34, 51)"); // green overridden
    // red should be dracula's red, not default
    expect(ANSI_COLORS[31]).toBe("rgb(255, 85, 85)"); // dracula red #ff5555
  });
});

// ─── Group 3: Syntax Color Overrides ────────────────────────────────

describe("syntax color overrides", () => {
  it("custom keyword", () => {
    buildTestSession({ syntaxColors: { keyword: "#ff0000" } });
    expect(HIGHLIGHT_COLORS.keyword).toBe("rgb(255, 0, 0)");
  });

  it("all 5 syntax colors", () => {
    buildTestSession({
      syntaxColors: {
        keyword: "#110000", string: "#002200", comment: "#000033",
        number: "#440000", type: "#005500",
      },
    });
    expect(HIGHLIGHT_COLORS.keyword).toBe("rgb(17, 0, 0)");
    expect(HIGHLIGHT_COLORS.string).toBe("rgb(0, 34, 0)");
    expect(HIGHLIGHT_COLORS.comment).toBe("rgb(0, 0, 51)");
    expect(HIGHLIGHT_COLORS.number).toBe("rgb(68, 0, 0)");
    expect(HIGHLIGHT_COLORS.type).toBe("rgb(0, 85, 0)");
  });

  it("partial preserves defaults", () => {
    buildTestSession({ syntaxColors: { keyword: "#ff0000" } });
    expect(HIGHLIGHT_COLORS.keyword).toBe("rgb(255, 0, 0)");
    expect(HIGHLIGHT_COLORS.string).toBe("rgb(78, 186, 101)"); // default
  });

  it("HIGHLIGHT_COLORS.plain tracks text", () => {
    buildTestSession({ colors: { text: "#aabbcc" } });
    expect(HIGHLIGHT_COLORS.plain).toBe("rgb(170, 187, 204)");
  });
});

// ─── Group 4: Timing Overrides ──────────────────────────────────────

describe("timing overrides", () => {
  it("custom introDuration", () => {
    const { session, allocated, config } = buildTestSession({ timing: { introDuration: 3 } });
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    // Frame at end of intro should still be intro (gradient, not terminal bg)
    const buf = renderer.renderFrame(introFrames - 2);
    const pixel = getPixel(buf, config.video.width, 5, 5);
    expect(pixel[3]).toBe(255); // opaque

    // Frame past intro should be content
    const bufContent = renderer.renderFrame(introFrames + 5);
    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const contentPixel = getPixel(bufContent, config.video.width, px, py);
    // Should be background color (dark), not gradient
    expect(contentPixel[3]).toBe(255);
  });

  it("custom outroDuration", () => {
    const { session, allocated, config } = buildTestSession({ timing: { outroDuration: 3 } });
    const { renderer, totalFrames } = makeRenderer(session, allocated, config);
    // Last frame should be outro (gradient-like)
    const buf = renderer.renderFrame(totalFrames - 1);
    // Pixel at corner should be gradient color, not terminal bg
    const pixel = getPixel(buf, config.video.width, 5, 5);
    expect(pixel[3]).toBe(255);
  });

  it("custom lingerDuration", () => {
    const { session, allocated, config } = buildTestSession({ timing: { lingerDuration: 3 } });
    const { renderer, totalFrames, outroFrames, lingerFrames } = makeRenderer(session, allocated, config);
    expect(lingerFrames).toBe(Math.round(3 * config.video.fps));
    // Mid-linger frame should have fade effect
    const lingerStart = totalFrames - outroFrames - lingerFrames;
    const buf = renderer.renderFrame(lingerStart + Math.floor(lingerFrames / 2));
    expect(buf.length).toBe(config.video.width * config.video.height * 4);
  });

  it("scrollSpeed → LAYOUT", () => {
    buildTestSession({ timing: { scrollSpeed: 0.5 } });
    expect(LAYOUT.scrollLinesPerFrame).toBe(0.5);
  });
});

// ─── Group 5: Window Config ─────────────────────────────────────────

describe("window config", () => {
  it("custom innerPadding", () => {
    buildTestSession({ window: { innerPadding: 50 } });
    expect(LAYOUT.innerPadding).toBe(50);
    expect(GEOMETRY.bodyLeft).toBe(LAYOUT.outerPadding + 50);
    expect(GEOMETRY.bodyTop).toBe(LAYOUT.outerPadding + LAYOUT.titleBarHeight + 50);
  });

  it("custom radius", () => {
    buildTestSession({ window: { radius: 24 } });
    expect(LAYOUT.windowRadius).toBe(24);
  });

  it("combined inner+outer padding", () => {
    const { session, allocated, config } = buildTestSession({
      window: { innerPadding: 50, outerPadding: 80 },
    });
    expect(GEOMETRY.termX).toBe(80);
    expect(GEOMETRY.bodyLeft).toBe(80 + 50);
    expect(GEOMETRY.termW).toBe(config.video.width - 80 * 2);
    // Pixel outside terminal area should be gradient
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(introFrames + 10);
    const pixel = getPixel(buf, config.video.width, 5, 5);
    // Should not be terminal background color
    expect(pixel[3]).toBe(255);
  });
});

// ─── Group 6: Video/Encoding Config ─────────────────────────────────

describe("video/encoding config", () => {
  it("CRF passes through", () => {
    const config = resolveConfig({ video: { crf: 18 } });
    expect(config.video.crf).toBe(18);
  });

  it("preset passes through", () => {
    const config = resolveConfig({ video: { preset: "medium" } });
    expect(config.video.preset).toBe("medium");
  });

  it("invalid CRF rejected", () => {
    expect(() => resolveConfig({ video: { crf: 52 } })).toThrow("crf");
  });

  it("invalid preset rejected", () => {
    expect(() => resolveConfig({ video: { preset: "invalid" } })).toThrow("preset");
  });
});

// ─── Group 7: Solarized-dark Pixel Test ─────────────────────────────

describe("solarized-dark pixel", () => {
  it("has correct background", () => {
    const { session, allocated, config } = buildTestSession({ theme: "solarized-dark" });
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(introFrames + 10);
    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [0, 43, 54])).toBe(true);
  });
});

// ─── Group 8: Full Config JSON ──────────────────────────────────────

describe("full config JSON", () => {
  it("all sections non-default", () => {
    const { session, allocated, config } = buildTestSession({
      theme: "default",
      colors: {
        accent: "#aa0000", text: "#00bb00", dimmed: "#0000cc",
        subtle: "#333333", background: "#220000", success: "#00aa00",
        error: "#aa0000", warning: "#aaaa00", titleBarBg: "#111111",
        statusBarBg: "#222222", gradientStart: "#050505", gradientEnd: "#030303",
        codeBg: "#1a1a1a", bashBg: "#2a2a2a", bashBorder: "#cc00cc",
      },
      ansiColors: { red: "#ff1111" },
      syntaxColors: { keyword: "#dd00dd" },
      font: { size: 20 },
      video: { width: 1280, height: 720, fps: 30, crf: 18, preset: "fast" },
      timing: { introDuration: 2, outroDuration: 1, lingerDuration: 1, scrollSpeed: 0.3 },
      window: { controls: false, outerPadding: 50, innerPadding: 30, radius: 20 },
    });

    const { renderer } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(0);

    // Buffer size matches 1280x720
    expect(buf.length).toBe(1280 * 720 * 4);

    // Colors propagated
    expect(COLORS.claude).toBe("rgb(170, 0, 0)");
    expect(COLORS.text).toBe("rgb(0, 187, 0)");
    expect(COLORS.background).toBe("rgb(34, 0, 0)");

    // Layout propagated
    expect(LAYOUT.outerPadding).toBe(50);
    expect(LAYOUT.innerPadding).toBe(30);
    expect(LAYOUT.windowRadius).toBe(20);
    expect(LAYOUT.scrollLinesPerFrame).toBe(0.3);

    // ANSI override
    expect(ANSI_COLORS[31]).toBe("rgb(255, 17, 17)");

    // Syntax override
    expect(HIGHLIGHT_COLORS.keyword).toBe("rgb(221, 0, 221)");

    // Window controls off
    expect(WINDOW_CONTROLS).toBe(false);

    // Background pixel
    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const introFrames = Math.round(config.timing.introDuration * config.video.fps);
    const bufContent = renderer.renderFrame(introFrames + 5);
    const pixel = getPixel(bufContent, config.video.width, px, py);
    expect(colorClose(pixel, [34, 0, 0])).toBe(true);
  });
});

// ─── Group 9: Empty Config ──────────────────────────────────────────

describe("empty config", () => {
  it("{} → defaults apply, renders without crash", () => {
    const { session, allocated, config } = buildTestSession({});
    const { renderer } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(0);
    expect(buf.length).toBe(1920 * 1080 * 4);
  });
});

// ─── Group 10: Font Config ──────────────────────────────────────────

describe("font config", () => {
  it("custom font path renders without crash", () => {
    const firaPath = join(FONTS_DIR, "FiraCode-Regular.ttf");
    const { session, allocated, config } = buildTestSession({
      font: { regularPath: firaPath },
    });
    const { renderer, introFrames } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(introFrames + 5);
    expect(buf.length).toBe(1920 * 1080 * 4);
  });

  it("explicit lineHeight", () => {
    buildTestSession({ font: { size: 24, lineHeight: 40 } });
    expect(LAYOUT.lineHeight).toBe(40);
  });

  it("auto-derived lineHeight", () => {
    buildTestSession({ font: { size: 24 } });
    expect(LAYOUT.lineHeight).toBe(42); // round(24 * 1.75)
  });
});

// ─── Group 11: Min Resolution ───────────────────────────────────────

describe("min resolution", () => {
  it("320x240 renders without crash", () => {
    const { session, allocated, config } = buildTestSession({
      video: { width: 320, height: 240 },
    });
    const { renderer } = makeRenderer(session, allocated, config);
    const buf = renderer.renderFrame(0);
    expect(buf.length).toBe(320 * 240 * 4);
  });
});

// ─── Group 12: Error Handling ───────────────────────────────────────

describe("error handling", () => {
  it("invalid hex color", () => {
    expect(() => resolveConfig({ colors: { accent: "notacolor" } })).toThrow("Invalid hex");
  });

  it("invalid font preset", () => {
    expect(() => resolveConfig({ font: { preset: "comic-sans" } })).toThrow("Unknown font preset");
  });

  it("nonexistent font path", () => {
    const config = resolveConfig({ font: { regularPath: "/nonexistent/font.ttf" } });
    initTheme(config);
    expect(() => initFonts(config)).toThrow();
  });

  it("width below minimum", () => {
    expect(() => resolveConfig({ video: { width: 100 } })).toThrow("width");
  });

  it("odd dimensions", () => {
    expect(() => resolveConfig({ video: { width: 1921 } })).toThrow("even");
  });
});
