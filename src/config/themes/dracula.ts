import type { CcreplayConfig } from "../schema.js";

export const dracula: Partial<CcreplayConfig> = {
  colors: {
    accent: "#ff79c6",
    text: "#f8f8f2",
    dimmed: "#6272a4",
    subtle: "#44475a",
    background: "#282a36",
    success: "#50fa7b",
    error: "#ff5555",
    warning: "#f1fa8c",
    titleBarBg: "#21222c",
    statusBarBg: "#191a21",
    gradientStart: "#1a1b26",
    gradientEnd: "#141520",
    codeBg: "#343746",
    bashBg: "#383a4a",
    bashBorder: "#bd93f9",
  },

  ansiColors: {
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },

  syntaxColors: {
    keyword: "#ff79c6",
    string: "#f1fa8c",
    comment: "#6272a4",
    number: "#bd93f9",
    type: "#8be9fd",
  },
};
