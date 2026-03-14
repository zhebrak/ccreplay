import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { LAYOUT, GEOMETRY } from "./theme.js";
import type { ResolvedConfig } from "../config/schema.js";
import { FONT_PRESETS, DEFAULT_FONT_PRESET } from "../config/fonts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "..", "..", "fonts");

let familyName = "JBMono";
let familyNameBold = "JBMono Bold";

const fontCache = new Map<string, string>();

export function font(size: number, bold?: boolean): string {
  const key = bold ? `b${size}` : `${size}`;
  let cached = fontCache.get(key);
  if (!cached) {
    cached = bold ? `bold ${size}px ${familyNameBold}` : `${size}px ${familyName}`;
    fontCache.set(key, cached);
  }
  return cached;
}

/** Initialize fonts from config. Registers font files and measures charWidth. */
export function initFonts(config: ResolvedConfig): void {
  fontCache.clear();

  const preset = FONT_PRESETS[config.font.preset];

  if (config.font.regularPath) {
    // Custom font file path (highest priority)
    const regularPath = resolve(config.font.regularPath);
    if (!existsSync(regularPath)) {
      throw new Error(`Font file not found: ${regularPath}`);
    }
    familyName = config.font.family || "CustomFont";
    familyNameBold = `${familyName} Bold`;
    GlobalFonts.registerFromPath(regularPath, familyName);
  } else if (preset) {
    // Use bundled preset fonts
    familyName = preset.family;
    familyNameBold = `${preset.family} Bold`;
    GlobalFonts.registerFromPath(join(FONTS_DIR, preset.regularFile), familyName);
    GlobalFonts.registerFromPath(join(FONTS_DIR, preset.boldFile), familyNameBold);
  } else {
    throw new Error(`Unknown font preset "${config.font.preset}". Available: ${Object.keys(FONT_PRESETS).join(", ")}`);
  }

  // Bold override: if boldPath is set, it overrides the preset/default bold
  if (config.font.boldPath) {
    const boldPath = resolve(config.font.boldPath);
    if (!existsSync(boldPath)) {
      throw new Error(`Font file not found: ${boldPath}`);
    }
    GlobalFonts.registerFromPath(boldPath, familyNameBold);
  } else if (config.font.regularPath) {
    // Custom regular with no custom bold — register bundled default bold as fallback
    GlobalFonts.registerFromPath(join(FONTS_DIR, FONT_PRESETS[DEFAULT_FONT_PRESET].boldFile), familyNameBold);
  }

  // Measure charWidth on a throwaway canvas
  const measureCanvas = createCanvas(200, 50);
  const ctx = measureCanvas.getContext("2d");
  ctx.font = font(config.font.size);
  const charWidth = ctx.measureText("M").width;

  // Update LAYOUT with measured values
  LAYOUT.charWidth = charWidth;
  LAYOUT.maxCharsPerLine = Math.floor(GEOMETRY.bodyMaxWidth / charWidth);
}
