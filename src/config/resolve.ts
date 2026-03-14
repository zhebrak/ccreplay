import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { CcreplayConfig, ResolvedConfig } from "./schema.js";
import { DEFAULT_CONFIG } from "./schema.js";
import { THEMES } from "./themes/index.js";
import { FONT_PRESETS } from "./fonts.js";

/** Convert #RRGGBB or #RRGGBBAA to rgb()/rgba(). Pass through rgb()/rgba() unchanged. */
export function hexToRgb(hex: string): string {
  if (hex.startsWith("rgb")) return hex;

  const raw = hex.replace(/^#/, "");
  let r: number, g: number, b: number;

  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else if (raw.length === 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  } else if (raw.length === 8) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
    const a = parseInt(raw.slice(6, 8), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error(`Invalid hex color: ${hex}`);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Deep merge objects. Later sources override earlier ones. Skips undefined. */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  const result = { ...target };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source) as (keyof T)[]) {
      const val = source[key];
      if (val === undefined) continue;
      if (val !== null && typeof val === "object" && !Array.isArray(val) &&
          result[key] !== null && typeof result[key] === "object" && !Array.isArray(result[key])) {
        result[key] = deepMerge(result[key] as any, val as any);
      } else {
        result[key] = val as T[keyof T];
      }
    }
  }
  return result;
}

/** Load config file from standard locations. Returns null if not found. */
export function loadConfigFile(explicitPath?: string): Partial<CcreplayConfig> | null {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`Config file not found: ${explicitPath}`);
    }
    try {
      return JSON.parse(readFileSync(explicitPath, "utf-8")) as Partial<CcreplayConfig>;
    } catch (e: any) {
      throw new Error(`Failed to parse config file ${explicitPath}: ${e.message}`);
    }
  }

  const locations = [
    join(process.cwd(), "ccreplay.config.json"),
    join(homedir(), ".config", "ccreplay", "config.json"),
  ];

  for (const loc of locations) {
    if (existsSync(loc)) {
      try {
        return JSON.parse(readFileSync(loc, "utf-8")) as Partial<CcreplayConfig>;
      } catch (e: any) {
        throw new Error(`Failed to parse config file ${loc}: ${e.message}`);
      }
    }
  }

  return null;
}

/** ANSI color name to code mapping */
const ANSI_NAME_TO_CODE: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37,
  brightBlack: 90, brightRed: 91, brightGreen: 92, brightYellow: 93,
  brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97,
};

/** Convert named ansiColors to numeric-keyed record with rgb() values */
export function resolveAnsiColors(
  ansi: ResolvedConfig["ansiColors"]
): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [name, code] of Object.entries(ANSI_NAME_TO_CODE)) {
    result[code] = hexToRgb(ansi[name as keyof typeof ansi]);
  }
  return result;
}

/** Convert all hex colors in a colors object to rgb() */
function resolveHexColors<T extends Record<string, string>>(colors: T): T {
  const result = { ...colors };
  for (const key of Object.keys(result) as (keyof T)[]) {
    result[key] = hexToRgb(result[key] as string) as T[keyof T];
  }
  return result;
}

const VALID_PRESETS = [
  "ultrafast", "superfast", "veryfast", "faster", "fast",
  "medium", "slow", "slower", "veryslow", "placebo",
];

/** Validate resolved config values are in range */
export function validateConfig(config: ResolvedConfig): void {
  const { video, font } = config;

  if (video.fps < 1 || video.fps > 120) {
    throw new Error(`fps must be 1-120, got ${video.fps}`);
  }
  if (video.width < 320 || video.width > 7680) {
    throw new Error(`width must be 320-7680, got ${video.width}`);
  }
  if (video.width % 2 !== 0) {
    throw new Error(`width must be even (yuv420p), got ${video.width}`);
  }
  if (video.height < 240 || video.height > 4320) {
    throw new Error(`height must be 240-4320, got ${video.height}`);
  }
  if (video.height % 2 !== 0) {
    throw new Error(`height must be even (yuv420p), got ${video.height}`);
  }
  if (video.crf < 0 || video.crf > 51) {
    throw new Error(`crf must be 0-51, got ${video.crf}`);
  }
  if (!VALID_PRESETS.includes(video.preset)) {
    throw new Error(`preset must be one of: ${VALID_PRESETS.join(", ")}; got "${video.preset}"`);
  }
  if (font.size < 8 || font.size > 72) {
    throw new Error(`font.size must be 8-72, got ${font.size}`);
  }
  if (config.timing.scrollSpeed <= 0 || config.timing.scrollSpeed > 10) {
    throw new Error(`timing.scrollSpeed must be >0 and <=10, got ${config.timing.scrollSpeed}`);
  }
  if (config.window.outerPadding < 0) {
    throw new Error(`window.outerPadding must be >= 0, got ${config.window.outerPadding}`);
  }
  if (config.window.innerPadding < 0) {
    throw new Error(`window.innerPadding must be >= 0, got ${config.window.innerPadding}`);
  }
  if (config.window.radius < 0) {
    throw new Error(`window.radius must be >= 0, got ${config.window.radius}`);
  }
  if (config.timing.introDuration < 0) {
    throw new Error(`timing.introDuration must be >= 0, got ${config.timing.introDuration}`);
  }
  if (config.timing.outroDuration < 0) {
    throw new Error(`timing.outroDuration must be >= 0, got ${config.timing.outroDuration}`);
  }
  if (config.timing.lingerDuration < 0) {
    throw new Error(`timing.lingerDuration must be >= 0, got ${config.timing.lingerDuration}`);
  }
}

/** Full resolution pipeline: defaults <- theme <- config file <- CLI */
export function resolveConfig(
  cliOverrides: Partial<CcreplayConfig>,
  configFilePath?: string,
): ResolvedConfig {
  const fileConfig = loadConfigFile(configFilePath);

  // Determine theme name: CLI > config file > default
  const themeName = cliOverrides.theme ?? fileConfig?.theme ?? DEFAULT_CONFIG.theme;

  if (themeName !== "default" && !THEMES[themeName]) {
    throw new Error(`Unknown theme "${themeName}". Available: ${Object.keys(THEMES).join(", ")}`);
  }

  const themePreset = themeName !== "default" ? THEMES[themeName] : {};

  // Layer: defaults <- theme <- config file <- CLI
  const merged = deepMerge(
    DEFAULT_CONFIG,
    themePreset as ResolvedConfig,
    (fileConfig ?? {}) as ResolvedConfig,
    cliOverrides as ResolvedConfig,
  );

  // Validate font preset name
  if (merged.font.preset && !merged.font.regularPath && !FONT_PRESETS[merged.font.preset]) {
    throw new Error(`Unknown font preset "${merged.font.preset}". Available: ${Object.keys(FONT_PRESETS).join(", ")}`);
  }

  // Resolve font preset to family name if no custom path overrides it
  if (merged.font.preset && !merged.font.regularPath) {
    const fontPreset = FONT_PRESETS[merged.font.preset];
    if (fontPreset) {
      merged.font.family = fontPreset.family;
    }
  }

  // Auto-derive lineHeight from fontSize when no source explicitly set lineHeight
  const lineHeightExplicit = cliOverrides.font?.lineHeight !== undefined
    || fileConfig?.font?.lineHeight !== undefined;
  if (!lineHeightExplicit && merged.font.size !== DEFAULT_CONFIG.font.size) {
    merged.font.lineHeight = Math.round(merged.font.size * 1.75);
  }

  // Resolve hex colors to rgb()
  merged.colors = resolveHexColors(merged.colors);
  merged.ansiColors = resolveHexColors(merged.ansiColors);
  merged.syntaxColors = resolveHexColors(merged.syntaxColors);

  validateConfig(merged);
  return merged;
}

/** Generate starter config JSON string */
export function generateStarterConfig(): string {
  const d = DEFAULT_CONFIG;
  const starter: CcreplayConfig = {
    theme: d.theme,
    colors: {
      accent: d.colors.accent,
      background: d.colors.background,
      text: d.colors.text,
    },
    font: {
      preset: d.font.preset,
      size: d.font.size,
    },
    video: {
      width: d.video.width,
      height: d.video.height,
      fps: d.video.fps,
      crf: d.video.crf,
    },
    timing: {
      introDuration: d.timing.introDuration,
      outroDuration: d.timing.outroDuration,
      lingerDuration: d.timing.lingerDuration,
    },
    window: {
      controls: d.window.controls,
    },
  };
  return JSON.stringify(starter, null, 2) + "\n";
}
