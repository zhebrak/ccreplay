import { describe, it, expect } from "vitest";
import { join } from "path";
import { FONT_PRESETS, DEFAULT_FONT_PRESET } from "../src/config/fonts.js";
import { resolveConfig } from "../src/config/resolve.js";
import { initTheme, LAYOUT } from "../src/renderer/theme.js";
import { initFonts } from "../src/renderer/fonts.js";

const FONTS_DIR = join(__dirname, "..", "fonts");

function initWithPreset(preset: string) {
  const config = resolveConfig({ font: { preset } });
  initTheme(config);
  initFonts(config);
  return { config, charWidth: LAYOUT.charWidth };
}

describe("font presets", () => {
  it("FONT_PRESETS has entries for all bundled fonts", () => {
    expect(FONT_PRESETS["jetbrains-mono"]).toBeDefined();
    expect(FONT_PRESETS["fira-code"]).toBeDefined();
    expect(FONT_PRESETS["source-code-pro"]).toBeDefined();
  });

  it("DEFAULT_FONT_PRESET is jetbrains-mono", () => {
    expect(DEFAULT_FONT_PRESET).toBe("jetbrains-mono");
  });

  it("default config resolves to JetBrains Mono preset", () => {
    const config = resolveConfig({});
    expect(config.font.preset).toBe("jetbrains-mono");
    expect(config.font.family).toBe("JBMono");
  });

  it("fira-code preset initializes and measures charWidth", () => {
    const { charWidth } = initWithPreset("fira-code");
    expect(charWidth).toBeGreaterThan(0);
    expect(charWidth).toBeLessThan(20);
  });

  it("source-code-pro preset initializes and measures charWidth", () => {
    const { charWidth } = initWithPreset("source-code-pro");
    expect(charWidth).toBeGreaterThan(0);
    expect(charWidth).toBeLessThan(20);
  });

  it("different presets may produce different charWidth", () => {
    const jb = initWithPreset("jetbrains-mono");
    const fira = initWithPreset("fira-code");
    const scp = initWithPreset("source-code-pro");
    // All should be positive, but at least some should differ
    expect(jb.charWidth).toBeGreaterThan(0);
    expect(fira.charWidth).toBeGreaterThan(0);
    expect(scp.charWidth).toBeGreaterThan(0);
  });

  it("preset resolution sets family in ResolvedConfig", () => {
    const config = resolveConfig({ font: { preset: "fira-code" } });
    expect(config.font.family).toBe("FiraCode");
    expect(config.font.preset).toBe("fira-code");
  });

  it("custom file path still works with bundled font", () => {
    const regularPath = join(FONTS_DIR, "JetBrainsMono-Regular.ttf");
    const config = resolveConfig({ font: { regularPath } });
    initTheme(config);
    initFonts(config);
    expect(LAYOUT.charWidth).toBeGreaterThan(0);
  });

  it("unknown preset with no regularPath throws in resolveConfig", () => {
    expect(() => resolveConfig({ font: { preset: "nonexistent" } })).toThrow("Unknown font preset");
  });

  it("custom boldPath overrides preset bold", () => {
    const boldPath = join(FONTS_DIR, "FiraCode-Bold.ttf");
    const config = resolveConfig({ font: { boldPath } });
    initTheme(config);
    initFonts(config);
    expect(LAYOUT.charWidth).toBeGreaterThan(0);
  });

  it("custom regularPath with no boldPath uses default bold fallback", () => {
    const regularPath = join(FONTS_DIR, "FiraCode-Regular.ttf");
    const config = resolveConfig({ font: { regularPath } });
    initTheme(config);
    initFonts(config);
    expect(LAYOUT.charWidth).toBeGreaterThan(0);
  });

  it("nonexistent boldPath throws", () => {
    const config = resolveConfig({ font: { boldPath: "/nonexistent/font.ttf" } });
    initTheme(config);
    expect(() => initFonts(config)).toThrow("Font file not found");
  });

  it("auto-derives lineHeight when fontSize changes without explicit lineHeight", () => {
    const config = resolveConfig({ font: { size: 24 } });
    expect(config.font.lineHeight).toBe(Math.round(24 * 1.75));
  });

  it("preserves explicit lineHeight even with custom fontSize", () => {
    const config = resolveConfig({ font: { size: 24, lineHeight: 40 } });
    expect(config.font.lineHeight).toBe(40);
  });
});
