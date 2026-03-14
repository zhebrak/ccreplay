import { DEFAULT_FONT_PRESET, FONT_PRESETS } from "./fonts.js";

export interface CcreplayConfig {
  theme?: string;

  colors?: {
    accent?: string;
    text?: string;
    dimmed?: string;
    subtle?: string;
    background?: string;
    success?: string;
    error?: string;
    warning?: string;
    titleBarBg?: string;
    statusBarBg?: string;
    gradientStart?: string;
    gradientEnd?: string;
    codeBg?: string;
    bashBg?: string;
    bashBorder?: string;
  };

  ansiColors?: {
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  };

  syntaxColors?: {
    keyword?: string;
    string?: string;
    comment?: string;
    number?: string;
    type?: string;
  };

  font?: {
    preset?: string;
    family?: string;
    regularPath?: string;
    boldPath?: string;
    size?: number;
    lineHeight?: number;
  };

  video?: {
    width?: number;
    height?: number;
    fps?: number;
    crf?: number;
    preset?: string;
  };

  timing?: {
    introDuration?: number;
    outroDuration?: number;
    lingerDuration?: number;
    scrollSpeed?: number;
  };

  window?: {
    controls?: boolean;
    outerPadding?: number;
    innerPadding?: number;
    radius?: number;
  };
}

export interface ResolvedConfig {
  theme: string;

  colors: {
    accent: string;
    text: string;
    dimmed: string;
    subtle: string;
    background: string;
    success: string;
    error: string;
    warning: string;
    titleBarBg: string;
    statusBarBg: string;
    gradientStart: string;
    gradientEnd: string;
    codeBg: string;
    bashBg: string;
    bashBorder: string;
  };

  ansiColors: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };

  syntaxColors: {
    keyword: string;
    string: string;
    comment: string;
    number: string;
    type: string;
  };

  font: {
    preset: string;
    family: string;
    regularPath: string | null;
    boldPath: string | null;
    size: number;
    lineHeight: number;
  };

  video: {
    width: number;
    height: number;
    fps: number;
    crf: number;
    preset: string;
  };

  timing: {
    introDuration: number;
    outroDuration: number;
    lingerDuration: number;
    scrollSpeed: number;
  };

  window: {
    controls: boolean;
    outerPadding: number;
    innerPadding: number;
    radius: number;
  };
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  theme: "default",

  colors: {
    accent: "#d77757",
    text: "#ffffff",
    dimmed: "#999999",
    subtle: "#505050",
    background: "#121218",
    success: "#4eba65",
    error: "#ff6b80",
    warning: "#ffc107",
    titleBarBg: "#141c20",
    statusBarBg: "#10181c",
    gradientStart: "#0a1418",
    gradientEnd: "#081016",
    codeBg: "#1c2428",
    bashBg: "#20282c",
    bashBorder: "#fd5db1",
  },

  ansiColors: {
    black: "#505050",
    red: "#ff6b80",
    green: "#4eba65",
    yellow: "#ffc107",
    blue: "#6495ed",
    magenta: "#d77757",
    cyan: "#00b7eb",
    white: "#ffffff",
    brightBlack: "#808080",
    brightRed: "#ff9696",
    brightGreen: "#78dc8c",
    brightYellow: "#ffdc64",
    brightBlue: "#96b4ff",
    brightMagenta: "#ff96c8",
    brightCyan: "#64dcff",
    brightWhite: "#ffffff",
  },

  syntaxColors: {
    keyword: "#af87ff",
    string: "#4eba65",
    comment: "#808080",
    number: "#ffc107",
    type: "#00b7eb",
  },

  font: {
    preset: DEFAULT_FONT_PRESET,
    family: FONT_PRESETS[DEFAULT_FONT_PRESET].family,
    regularPath: null,
    boldPath: null,
    size: 18,
    lineHeight: 32,
  },

  video: {
    width: 1920,
    height: 1080,
    fps: 60,
    crf: 23,
    preset: "ultrafast",
  },

  timing: {
    introDuration: 1.5,
    outroDuration: 2,
    lingerDuration: 2,
    scrollSpeed: 0.15,
  },

  window: {
    controls: true,
    outerPadding: 40,
    innerPadding: 36,
    radius: 16,
  },
};
