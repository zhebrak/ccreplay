export const COLORS = {
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
  userMessageBg: "rgb(55, 55, 55)",
  codeBg: "rgb(28, 36, 40)",
  bashMessageBg: "rgb(32, 40, 44)",
  titleBarBg: "rgb(20, 28, 32)",
  statusBarBg: "rgb(16, 24, 28)",
  progressFill: "rgb(215, 119, 87)",
  progressBg: "rgb(40, 40, 40)",

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
} as const;

/** Convert any rgb()/rgba() color string to rgba() with the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) return color;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

export const LAYOUT = {
  width: 1920,
  height: 1080,
  fps: 60,
  innerPadding: 36,
  outerPadding: 40,
  titleBarHeight: 44,
  statusBarHeight: 48,
  lineHeight: 28,
  scrollLinesPerFrame: 0.15,
  fontSize: 16,
  fontSizeLarge: 18,
  fontSizeTitle: 14,
  toolBoxPadding: 16,
  toolBoxRadius: 10,
  toolBoxBorderWidth: 2,
  toolBoxMarginY: 4,

  charWidth: 9.6,
  maxCharsPerLine: 175,

  // Window chrome
  windowRadius: 16,
  shadowBlur: 30,
  shadowOffsetY: 8,
  trafficDotRadius: 6,
  trafficDotSpacing: 20,
  trafficDotsLeftMargin: 20,
} as const;

export const ANSI_COLORS: Record<number, string> = {
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

export type ColorKey = keyof typeof COLORS;

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

// Pre-computed terminal window geometry
const termX = LAYOUT.outerPadding;
const termY = LAYOUT.outerPadding;
const termW = LAYOUT.width - LAYOUT.outerPadding * 2;
const termH = LAYOUT.height - LAYOUT.outerPadding * 2;

export const GEOMETRY = {
  termX,
  termY,
  termW,
  termH,
  bodyTop: termY + LAYOUT.titleBarHeight + LAYOUT.innerPadding,
  bodyLeft: termX + LAYOUT.innerPadding,
  bodyMaxWidth: termW - LAYOUT.innerPadding * 2,
  toolboxMarginBottom: LAYOUT.lineHeight * 0.7,
  progressBarHeight: 6,
  progressBarWidthRatio: 0.5,
} as const;
