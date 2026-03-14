import { describe, it, expect } from "vitest";
import { join } from "path";
import { parseSession } from "../src/parser/parse-session.js";
import { extractMoments } from "../src/parser/extract-moments.js";
import { buildTimeline } from "../src/timeline/build-timeline.js";
import { allocateBudgets } from "../src/timeline/budget-allocator.js";
import { FrameRenderer } from "../src/renderer/frame-renderer.js";
import { COLORS, LAYOUT, GEOMETRY, initTheme, parseRgb } from "../src/renderer/theme.js";
import { initFonts } from "../src/renderer/fonts.js";
import { resolveConfig, resolveAnsiColors } from "../src/config/resolve.js";
import type { CcreplayConfig } from "../src/config/schema.js";
import { getPixel, colorClose } from "./helpers.js";

const FIXTURE = join(__dirname, "fixtures", "minimal-session.jsonl");

function setupTheme(themeName?: string) {
  const config = resolveConfig(themeName ? { theme: themeName } : {});
  initTheme(config);
  initFonts(config);
  return config;
}

function renderContentFrame(themeName?: string) {
  const config = setupTheme(themeName);
  const session = parseSession(FIXTURE);
  const moments = extractMoments(session.events);
  const timeline = buildTimeline(session.events, moments);
  const allocated = allocateBudgets(timeline, {
    targetDurationS: 10, fps: config.video.fps,
    width: config.video.width, height: config.video.height,
    introDurationS: 1, outroDurationS: 1, lingerDurationS: 0,
  });
  const totalFrames = Math.round(10 * config.video.fps);
  const introFrames = Math.round(1 * config.video.fps);
  const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);
  return { buf: renderer.renderFrame(introFrames + 10), config };
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function contrastRatio(color1: string, color2: string): number {
  const [r1, g1, b1] = parseRgb(color1);
  const [r2, g2, b2] = parseRgb(color2);

  // Relative luminance (sRGB)
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L1 = 0.2126 * toLinear(r1) + 0.7152 * toLinear(g1) + 0.0722 * toLinear(b1);
  const L2 = 0.2126 * toLinear(r2) + 0.7152 * toLinear(g2) + 0.0722 * toLinear(b2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const THEMES = ["default", "dracula", "monokai", "solarized-dark", "light"];

describe("theme background pixels", () => {
  const expectedBg: Record<string, [number, number, number]> = {
    "default": [18, 18, 24],
    "dracula": [40, 42, 54],
    "monokai": [39, 40, 34],
    "solarized-dark": [0, 43, 54],
    "light": [250, 250, 250],
  };

  for (const theme of THEMES) {
    it(`${theme} has correct background`, () => {
      const { buf, config } = renderContentFrame(theme === "default" ? undefined : theme);
      const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
      const py = GEOMETRY.bodyTop + 5;
      const pixel = getPixel(buf, config.video.width, px, py);
      expect(colorClose(pixel, expectedBg[theme], 12)).toBe(true);
    });
  }
});

describe("theme title bar pixels", () => {
  for (const theme of THEMES) {
    it(`${theme} title bar differs from background`, () => {
      const config = setupTheme(theme === "default" ? undefined : theme);
      // Title bar and background should not be identical
      expect(COLORS.titleBarBg).not.toBe(COLORS.background);
    });
  }
});

describe("theme status bar pixels", () => {
  for (const theme of THEMES) {
    it(`${theme} status bar differs from background`, () => {
      const config = setupTheme(theme === "default" ? undefined : theme);
      expect(COLORS.statusBarBg).not.toBe(COLORS.background);
    });
  }
});

describe("light theme specific checks", () => {
  it("background luminance > 200", () => {
    const config = setupTheme("light");
    const [r, g, b] = parseRgb(COLORS.background);
    expect(luminance(r, g, b)).toBeGreaterThan(200);
  });

  it("text luminance < 100", () => {
    setupTheme("light");
    const [r, g, b] = parseRgb(COLORS.text);
    expect(luminance(r, g, b)).toBeLessThan(100);
  });

  it("gradient is also light", () => {
    setupTheme("light");
    const [r1, g1, b1] = parseRgb(COLORS.outerGradientStart);
    const [r2, g2, b2] = parseRgb(COLORS.outerGradientEnd);
    expect(luminance(r1, g1, b1)).toBeGreaterThan(200);
    expect(luminance(r2, g2, b2)).toBeGreaterThan(200);
  });
});

describe("contrast checks", () => {
  for (const theme of THEMES) {
    it(`${theme}: text vs background contrast > 3:1`, () => {
      setupTheme(theme === "default" ? undefined : theme);
      const ratio = contrastRatio(COLORS.text, COLORS.background);
      expect(ratio).toBeGreaterThan(3);
    });

    it(`${theme}: accent vs background contrast > 2:1`, () => {
      setupTheme(theme === "default" ? undefined : theme);
      const ratio = contrastRatio(COLORS.claude, COLORS.background);
      expect(ratio).toBeGreaterThan(2);
    });
  }
});

describe("ANSI palette coherence", () => {
  for (const theme of THEMES) {
    it(`${theme}: all 16 ANSI colors are valid rgb()`, () => {
      const config = setupTheme(theme === "default" ? undefined : theme);
      const ansi = resolveAnsiColors(config.ansiColors);
      const codes = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
      for (const code of codes) {
        expect(ansi[code]).toMatch(/^rgb\(/);
      }
    });

    it(`${theme}: no two base ANSI colors are identical (excluding white/brightWhite)`, () => {
      const config = setupTheme(theme === "default" ? undefined : theme);
      const ansi = resolveAnsiColors(config.ansiColors);
      // Check base 8 colors (30-37) minus white
      const baseCodes = [30, 31, 32, 33, 34, 35, 36];
      const baseColors = baseCodes.map(c => ansi[c]);
      const unique = new Set(baseColors);
      expect(unique.size).toBe(baseCodes.length);
    });
  }
});
