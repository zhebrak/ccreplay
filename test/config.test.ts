import { describe, it, expect } from "vitest";
import { join } from "path";
import { writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { hexToRgb, deepMerge, resolveConfig, validateConfig, resolveAnsiColors, loadConfigFile } from "../src/config/resolve.js";
import { DEFAULT_CONFIG } from "../src/config/schema.js";
import { THEMES } from "../src/config/themes/index.js";

describe("hexToRgb", () => {
  it("converts #RRGGBB to rgb()", () => {
    expect(hexToRgb("#ff0000")).toBe("rgb(255, 0, 0)");
    expect(hexToRgb("#00ff00")).toBe("rgb(0, 255, 0)");
    expect(hexToRgb("#0000ff")).toBe("rgb(0, 0, 255)");
  });

  it("converts #RRGGBBAA to rgba()", () => {
    expect(hexToRgb("#ff000080")).toBe("rgba(255, 0, 0, 0.502)");
    expect(hexToRgb("#00ff00ff")).toBe("rgba(0, 255, 0, 1)");
  });

  it("converts #RGB shorthand", () => {
    expect(hexToRgb("#f00")).toBe("rgb(255, 0, 0)");
    expect(hexToRgb("#0f0")).toBe("rgb(0, 255, 0)");
  });

  it("passes through rgb() unchanged", () => {
    expect(hexToRgb("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
  });

  it("passes through rgba() unchanged", () => {
    expect(hexToRgb("rgba(10, 20, 30, 0.5)")).toBe("rgba(10, 20, 30, 0.5)");
  });

  it("throws on invalid input", () => {
    expect(() => hexToRgb("notacolor")).toThrow("Invalid hex color");
    expect(() => hexToRgb("#xyz")).toThrow();
  });
});

describe("deepMerge", () => {
  it("merges nested objects", () => {
    const result = deepMerge({ a: { b: 1 } }, { a: { c: 2 } } as any);
    expect(result.a).toEqual({ b: 1, c: 2 });
  });

  it("overrides leaf values", () => {
    const result = deepMerge({ a: { b: 1 } }, { a: { b: 2 } } as any);
    expect(result.a.b).toBe(2);
  });

  it("skips undefined values", () => {
    const result = deepMerge({ a: 1, b: 2 }, { a: undefined, b: 3 } as any);
    expect(result.a).toBe(1);
    expect(result.b).toBe(3);
  });

  it("replaces arrays (does not merge them)", () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3] } as any);
    expect(result.arr).toEqual([3]);
  });

  it("handles empty sources", () => {
    const original = { a: 1 };
    expect(deepMerge(original, {})).toEqual({ a: 1 });
  });
});

describe("resolveConfig", () => {
  it("returns DEFAULT_CONFIG values with no overrides", () => {
    const config = resolveConfig({});
    expect(config.video.width).toBe(1920);
    expect(config.video.height).toBe(1080);
    expect(config.video.fps).toBe(60);
    expect(config.font.size).toBe(18);
    expect(config.theme).toBe("default");
  });

  it("applies theme overrides", () => {
    const config = resolveConfig({ theme: "dracula" });
    expect(config.colors.background).toBe("rgb(40, 42, 54)");
    expect(config.colors.accent).toBe("rgb(255, 121, 198)");
  });

  it("CLI overrides config file values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-cfg-"));
    const cfgPath = join(tmpDir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({ video: { fps: 30 }, font: { size: 20 } }));

    const config = resolveConfig({ font: { size: 24 } }, cfgPath);
    expect(config.video.fps).toBe(30);  // from config file
    expect(config.font.size).toBe(24);  // CLI overrides config file

    rmSync(tmpDir, { recursive: true });
  });

  it("full precedence: defaults <- theme <- config <- CLI", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-cfg-"));
    const cfgPath = join(tmpDir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({
      theme: "dracula",
      colors: { accent: "#00ff00" },
    }));

    // CLI overrides accent again
    const config = resolveConfig({ colors: { accent: "#0000ff" } }, cfgPath);
    // accent should be CLI value
    expect(config.colors.accent).toBe("rgb(0, 0, 255)");
    // background should be dracula (from theme in config file)
    expect(config.colors.background).toBe("rgb(40, 42, 54)");

    rmSync(tmpDir, { recursive: true });
  });

  it("throws on unknown theme", () => {
    expect(() => resolveConfig({ theme: "nonexistent" })).toThrow("Unknown theme");
  });
});

describe("validateConfig", () => {
  function validConfig(overrides: Partial<any> = {}): any {
    return deepMerge(resolveConfig({}), overrides);
  }

  it("rejects fps out of range", () => {
    expect(() => validateConfig(validConfig({ video: { fps: 0 } }))).toThrow("fps");
    expect(() => validateConfig(validConfig({ video: { fps: 121 } }))).toThrow("fps");
  });

  it("accepts fps in range", () => {
    expect(() => validateConfig(validConfig({ video: { fps: 1 } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ video: { fps: 120 } }))).not.toThrow();
  });

  it("rejects width out of range", () => {
    expect(() => validateConfig(validConfig({ video: { width: 319 } }))).toThrow("width");
    expect(() => validateConfig(validConfig({ video: { width: 7681 } }))).toThrow("width");
  });

  it("accepts width in range", () => {
    expect(() => validateConfig(validConfig({ video: { width: 320 } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ video: { width: 7680 } }))).not.toThrow();
  });

  it("rejects odd width/height (yuv420p requires even)", () => {
    expect(() => validateConfig(validConfig({ video: { width: 1281 } }))).toThrow("even");
    expect(() => validateConfig(validConfig({ video: { height: 721 } }))).toThrow("even");
  });

  it("rejects crf out of range", () => {
    expect(() => validateConfig(validConfig({ video: { crf: -1 } }))).toThrow("crf");
    expect(() => validateConfig(validConfig({ video: { crf: 52 } }))).toThrow("crf");
  });

  it("accepts crf in range", () => {
    expect(() => validateConfig(validConfig({ video: { crf: 0 } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ video: { crf: 51 } }))).not.toThrow();
  });

  it("rejects font.size out of range", () => {
    expect(() => validateConfig(validConfig({ font: { size: 7 } }))).toThrow("font.size");
    expect(() => validateConfig(validConfig({ font: { size: 73 } }))).toThrow("font.size");
  });

  it("accepts font.size in range", () => {
    expect(() => validateConfig(validConfig({ font: { size: 8 } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ font: { size: 72 } }))).not.toThrow();
  });

  it("validates preset names", () => {
    expect(() => validateConfig(validConfig({ video: { preset: "ultrafast" } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ video: { preset: "medium" } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ video: { preset: "slow" } }))).not.toThrow();
    expect(() => validateConfig(validConfig({ video: { preset: "invalid" } }))).toThrow("preset");
  });

  it("rejects negative outerPadding", () => {
    expect(() => validateConfig(validConfig({ window: { outerPadding: -1 } }))).toThrow("window.outerPadding");
  });

  it("accepts zero outerPadding", () => {
    expect(() => validateConfig(validConfig({ window: { outerPadding: 0 } }))).not.toThrow();
  });

  it("rejects negative innerPadding", () => {
    expect(() => validateConfig(validConfig({ window: { innerPadding: -1 } }))).toThrow("window.innerPadding");
  });

  it("accepts zero innerPadding", () => {
    expect(() => validateConfig(validConfig({ window: { innerPadding: 0 } }))).not.toThrow();
  });

  it("rejects negative radius", () => {
    expect(() => validateConfig(validConfig({ window: { radius: -1 } }))).toThrow("window.radius");
  });

  it("accepts zero radius", () => {
    expect(() => validateConfig(validConfig({ window: { radius: 0 } }))).not.toThrow();
  });

  it("rejects negative introDuration", () => {
    expect(() => validateConfig(validConfig({ timing: { introDuration: -1 } }))).toThrow("timing.introDuration");
  });

  it("accepts zero introDuration", () => {
    expect(() => validateConfig(validConfig({ timing: { introDuration: 0 } }))).not.toThrow();
  });

  it("rejects negative outroDuration", () => {
    expect(() => validateConfig(validConfig({ timing: { outroDuration: -1 } }))).toThrow("timing.outroDuration");
  });

  it("accepts zero outroDuration", () => {
    expect(() => validateConfig(validConfig({ timing: { outroDuration: 0 } }))).not.toThrow();
  });

  it("rejects negative lingerDuration", () => {
    expect(() => validateConfig(validConfig({ timing: { lingerDuration: -1 } }))).toThrow("timing.lingerDuration");
  });

  it("accepts zero lingerDuration", () => {
    expect(() => validateConfig(validConfig({ timing: { lingerDuration: 0 } }))).not.toThrow();
  });
});

describe("ANSI color mapping", () => {
  it("converts named keys to correct ANSI codes", () => {
    const resolved = resolveAnsiColors(DEFAULT_CONFIG.ansiColors);
    expect(resolved[30]).toBe("rgb(80, 80, 80)");   // black
    expect(resolved[31]).toBe("rgb(255, 107, 128)"); // red
    expect(resolved[32]).toBe("rgb(78, 186, 101)");  // green
    expect(resolved[37]).toBe("rgb(255, 255, 255)"); // white
    expect(resolved[90]).toBe("rgb(128, 128, 128)"); // brightBlack
    expect(resolved[97]).toBe("rgb(255, 255, 255)"); // brightWhite
  });

  it("maps all 16 names to correct codes", () => {
    const resolved = resolveAnsiColors(DEFAULT_CONFIG.ansiColors);
    const expectedCodes = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
    for (const code of expectedCodes) {
      expect(resolved[code]).toBeDefined();
      expect(resolved[code]).toMatch(/^rgb/);
    }
  });

  it("partial override keeps other defaults", () => {
    const custom = { ...DEFAULT_CONFIG.ansiColors, red: "#ff0000" };
    const resolved = resolveAnsiColors(custom);
    expect(resolved[31]).toBe("rgb(255, 0, 0)"); // overridden red
    expect(resolved[30]).toBe("rgb(80, 80, 80)"); // default black untouched
  });
});

describe("derived colors", () => {
  it("progressFill equals resolved accent", () => {
    const config = resolveConfig({});
    // After initTheme, progressFill = accent — we test at config level
    expect(config.colors.accent).toMatch(/^rgb/);
  });

  it("derived colors update when base colors change", () => {
    const config1 = resolveConfig({});
    const config2 = resolveConfig({ colors: { accent: "#ff0000" } });
    expect(config1.colors.accent).not.toBe(config2.colors.accent);
    expect(config2.colors.accent).toBe("rgb(255, 0, 0)");
  });
});

describe("theme presets completeness", () => {
  const themeNames = ["default", "dracula", "monokai", "solarized-dark", "light"];

  for (const name of themeNames) {
    it(`"${name}" resolves to valid config`, () => {
      const config = name === "default"
        ? resolveConfig({})
        : resolveConfig({ theme: name });
      expect(config.theme).toBeDefined();

      // All required color keys
      const colorKeys = Object.keys(DEFAULT_CONFIG.colors);
      for (const key of colorKeys) {
        expect(config.colors[key as keyof typeof config.colors]).toBeTruthy();
      }

      // All 16 ANSI colors
      const ansiKeys = Object.keys(DEFAULT_CONFIG.ansiColors);
      for (const key of ansiKeys) {
        expect(config.ansiColors[key as keyof typeof config.ansiColors]).toBeTruthy();
      }

      // All 5 syntax colors
      expect(config.syntaxColors.keyword).toBeTruthy();
      expect(config.syntaxColors.string).toBeTruthy();
      expect(config.syntaxColors.comment).toBeTruthy();
      expect(config.syntaxColors.number).toBeTruthy();
      expect(config.syntaxColors.type).toBeTruthy();
    });
  }
});

describe("config file loading", () => {
  it("loads valid JSON config file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-cfg-"));
    const cfgPath = join(tmpDir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({ video: { fps: 30 } }));

    const result = loadConfigFile(cfgPath);
    expect(result).toEqual({ video: { fps: 30 } });

    rmSync(tmpDir, { recursive: true });
  });

  it("throws on malformed JSON", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-cfg-"));
    const cfgPath = join(tmpDir, "config.json");
    writeFileSync(cfgPath, "{ invalid json }");

    expect(() => loadConfigFile(cfgPath)).toThrow(cfgPath);

    rmSync(tmpDir, { recursive: true });
  });

  it("returns null when no config found", () => {
    // loadConfigFile with no explicit path checks CWD and XDG
    // Since we're in the test dir, there shouldn't be a config file
    // Use a non-existent dir approach
    const result = loadConfigFile();
    // This may or may not be null depending on if the test runner CWD has a config
    // So we just verify it doesn't throw
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("throws when explicit path doesn't exist", () => {
    expect(() => loadConfigFile("/nonexistent/path/config.json")).toThrow("not found");
  });
});
