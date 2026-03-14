import type { CcreplayConfig } from "../schema.js";

export const solarizedDark: Partial<CcreplayConfig> = {
  colors: {
    accent: "#cb4b16",
    text: "#839496",
    dimmed: "#586e75",
    subtle: "#073642",
    background: "#002b36",
    success: "#859900",
    error: "#dc322f",
    warning: "#b58900",
    titleBarBg: "#002028",
    statusBarBg: "#001820",
    gradientStart: "#001e28",
    gradientEnd: "#001620",
    codeBg: "#073642",
    bashBg: "#0a3f4c",
    bashBorder: "#d33682",
  },

  ansiColors: {
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#93a1a1",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },

  syntaxColors: {
    keyword: "#859900",
    string: "#2aa198",
    comment: "#586e75",
    number: "#d33682",
    type: "#268bd2",
  },
};
