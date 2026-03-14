import type { ResolvedConfig } from "../config/schema.js";
import { resolveAnsiColors } from "../config/resolve.js";

export const COLORS: Record<string, string> = {
  claude: "rgb(215, 119, 87)",
  text: "rgb(255, 255, 255)",
  inactive: "rgb(153, 153, 153)",
  subtle: "rgb(80, 80, 80)",
  success: "rgb(78, 186, 101)",
  error: "rgb(255, 107, 128)",
  warning: "rgb(255, 193, 7)",
  permission: "rgb(177, 185, 249)",
  bashBorder: "rgb(253, 93, 177)",
  background: "rgb(18, 18, 24)",
  codeBg: "rgb(28, 36, 40)",
  bashMessageBg: "rgb(32, 40, 44)",
  titleBarBg: "rgb(20, 28, 32)",
  statusBarBg: "rgb(16, 24, 28)",
  progressFill: "rgb(215, 119, 87)",
  progressBg: "rgb(80, 80, 80)",

  // Outer gradient / window chrome
  outerGradientStart: "rgb(10, 20, 24)",
  outerGradientEnd: "rgb(8, 16, 22)",
  windowShadow: "rgba(0, 0, 0, 0.6)",
  titleBarBorder: "rgba(255, 255, 255, 0.06)",
  statusBarBorder: "rgba(0, 183, 235, 0.15)",
  trafficRed: "rgb(255, 95, 87)",
  trafficYellow: "rgb(255, 189, 46)",
  trafficGreen: "rgb(39, 201, 63)",
  cardBg: "rgba(22, 30, 36, 0.85)",
};

/** Convert any rgb()/rgba() color string to rgba() with the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  const m = color.match(/rgba?\(/);
  if (!m) return color;
  const [r, g, b] = parseRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const LAYOUT: Record<string, number> = {
  width: 1920,
  height: 1080,
  fps: 60,
  innerPadding: 36,
  outerPadding: 40,
  titleBarHeight: 44,
  statusBarHeight: 48,
  lineHeight: 32,
  scrollLinesPerFrame: 0.15,
  fontSize: 18,
  fontSizeLarge: 20,
  fontSizeTitle: 16,
  toolBoxPadding: 16,
  toolBoxRadius: 10,
  toolBoxBorderWidth: 2,
  toolBoxMarginY: 4,

  charWidth: 10.8,
  maxCharsPerLine: 163,

  // Window chrome
  windowRadius: 16,
  shadowBlur: 30,
  shadowOffsetY: 8,
  trafficDotRadius: 6,
  trafficDotSpacing: 20,
  trafficDotsLeftMargin: 20,
};

export let ANSI_COLORS: Record<number, string> = {
  30: "rgb(80, 80, 80)",       // black
  31: "rgb(255, 107, 128)",    // red
  32: "rgb(78, 186, 101)",     // green
  33: "rgb(255, 193, 7)",      // yellow
  34: "rgb(100, 149, 237)",    // blue
  35: "rgb(215, 119, 87)",     // magenta
  36: "rgb(0, 183, 235)",      // cyan
  37: "rgb(255, 255, 255)",    // white
  90: "rgb(128, 128, 128)",    // bright black
  91: "rgb(255, 150, 150)",    // bright red
  92: "rgb(120, 220, 140)",    // bright green
  93: "rgb(255, 220, 100)",    // bright yellow
  94: "rgb(150, 180, 255)",    // bright blue
  95: "rgb(255, 150, 200)",    // bright magenta
  96: "rgb(100, 220, 255)",    // bright cyan
  97: "rgb(255, 255, 255)",    // bright white
};

/** Parse "rgb(r, g, b)" or "rgba(r, g, b, a)" into [r, g, b] tuple. */
export function parseRgb(color: string): [number, number, number] {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Tool accent colors */
export const TOOL_ACCENT: Record<string, string> = {
  Read: COLORS.claude,
  Glob: COLORS.claude,
  Grep: COLORS.claude,
  Edit: COLORS.claude,
  MultiEdit: COLORS.claude,
  Write: COLORS.claude,
  Bash: COLORS.bashBorder,
  Agent: COLORS.claude,
};

/** Syntax highlight colors — mutable, updated by initTheme() */
export const HIGHLIGHT_COLORS: Record<string, string> = {
  keyword: "rgb(175, 135, 255)",
  string: COLORS.success,
  comment: "rgb(128, 128, 128)",
  number: COLORS.warning,
  type: "rgb(0, 183, 235)",
  plain: COLORS.text,
};

// Pre-computed terminal window geometry — mutable, updated by initTheme()
export const GEOMETRY: Record<string, number> = {
  termX: 0, termY: 0, termW: 0, termH: 0,
  bodyTop: 0, bodyLeft: 0, bodyMaxWidth: 0, toolboxMarginBottom: 0,
  progressBarHeight: 6,
  progressBarWidthRatio: 0.5,
};
recomputeGeometry();

/** Whether to draw traffic light window controls */
export let WINDOW_CONTROLS = true;

function recomputeGeometry() {
  GEOMETRY.termX = LAYOUT.outerPadding;
  GEOMETRY.termY = LAYOUT.outerPadding;
  GEOMETRY.termW = LAYOUT.width - LAYOUT.outerPadding * 2;
  GEOMETRY.termH = LAYOUT.height - LAYOUT.outerPadding * 2;
  GEOMETRY.bodyTop = LAYOUT.outerPadding + LAYOUT.titleBarHeight + LAYOUT.innerPadding;
  GEOMETRY.bodyLeft = LAYOUT.outerPadding + LAYOUT.innerPadding;
  GEOMETRY.bodyMaxWidth = GEOMETRY.termW - LAYOUT.innerPadding * 2;
  GEOMETRY.toolboxMarginBottom = LAYOUT.lineHeight * 0.7;
}

/** Compute luminance from rgb string */
function luminance(color: string): number {
  const [r, g, b] = parseRgb(color);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Initialize theme from resolved config. Must be called before rendering. */
export function initTheme(config: ResolvedConfig): void {
  const c = config.colors;

  // Map config color keys to COLORS keys
  COLORS.claude = c.accent;
  COLORS.text = c.text;
  COLORS.inactive = c.dimmed;
  COLORS.subtle = c.subtle;
  COLORS.background = c.background;
  COLORS.success = c.success;
  COLORS.error = c.error;
  COLORS.warning = c.warning;
  COLORS.titleBarBg = c.titleBarBg;
  COLORS.statusBarBg = c.statusBarBg;
  COLORS.outerGradientStart = c.gradientStart;
  COLORS.outerGradientEnd = c.gradientEnd;
  COLORS.codeBg = c.codeBg;
  COLORS.bashMessageBg = c.bashBg;
  COLORS.bashBorder = c.bashBorder;

  // Derived colors
  COLORS.progressFill = c.accent;
  COLORS.progressBg = c.subtle;
  COLORS.cardBg = withAlpha(c.background, 0.85);
  COLORS.windowShadow = "rgba(0, 0, 0, 0.6)";

  // Luminance-aware title bar border
  const bgLum = luminance(c.background);
  COLORS.titleBarBorder = bgLum > 128
    ? "rgba(0, 0, 0, 0.06)"
    : "rgba(255, 255, 255, 0.06)";

  // Status bar border from themed cyan with alpha
  const resolvedAnsi = resolveAnsiColors(config.ansiColors);
  COLORS.statusBarBorder = withAlpha(resolvedAnsi[36] || "rgb(0, 183, 235)", 0.15);

  // Update ANSI colors
  ANSI_COLORS = resolvedAnsi;

  // Update LAYOUT from config
  LAYOUT.width = config.video.width;
  LAYOUT.height = config.video.height;
  LAYOUT.fps = config.video.fps;
  LAYOUT.fontSize = config.font.size;
  LAYOUT.fontSizeLarge = config.font.size + 2;
  LAYOUT.fontSizeTitle = config.font.size - 2;
  LAYOUT.lineHeight = config.font.lineHeight;
  LAYOUT.outerPadding = config.window.outerPadding;
  LAYOUT.innerPadding = config.window.innerPadding;
  LAYOUT.windowRadius = config.window.radius;
  LAYOUT.scrollLinesPerFrame = config.timing.scrollSpeed;

  // Window controls toggle
  WINDOW_CONTROLS = config.window.controls;

  // Update syntax highlight colors
  HIGHLIGHT_COLORS.keyword = config.syntaxColors.keyword;
  HIGHLIGHT_COLORS.string = config.syntaxColors.string;
  HIGHLIGHT_COLORS.comment = config.syntaxColors.comment;
  HIGHLIGHT_COLORS.number = config.syntaxColors.number;
  HIGHLIGHT_COLORS.type = config.syntaxColors.type;
  HIGHLIGHT_COLORS.plain = c.text;

  // Rebuild TOOL_ACCENT with new colors
  for (const tool of Object.keys(TOOL_ACCENT)) {
    TOOL_ACCENT[tool] = tool === "Bash" ? COLORS.bashBorder : COLORS.claude;
  }

  // Recompute geometry
  recomputeGeometry();
}
