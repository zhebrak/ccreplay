import { GlobalFonts } from "@napi-rs/canvas";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "..", "..", "fonts");

let fontsRegistered = false;
export function ensureFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(join(FONTS_DIR, "JetBrainsMono-Regular.ttf"), "JBMono");
  GlobalFonts.registerFromPath(join(FONTS_DIR, "JetBrainsMono-Bold.ttf"), "JBMono Bold");
  fontsRegistered = true;
}

const fontCache = new Map<string, string>();
export function font(size: number, bold?: boolean): string {
  const key = bold ? `b${size}` : `${size}`;
  let cached = fontCache.get(key);
  if (!cached) {
    cached = bold ? `bold ${size}px JBMono Bold` : `${size}px JBMono`;
    fontCache.set(key, cached);
  }
  return cached;
}
