import type { CcreplayConfig } from "../schema.js";

export const monokai: Partial<CcreplayConfig> = {
  colors: {
    accent: "#f92672",
    text: "#f8f8f2",
    dimmed: "#75715e",
    subtle: "#49483e",
    background: "#272822",
    success: "#a6e22e",
    error: "#f92672",
    warning: "#e6db74",
    titleBarBg: "#1e1f1a",
    statusBarBg: "#191a15",
    gradientStart: "#1c1d17",
    gradientEnd: "#151610",
    codeBg: "#33342c",
    bashBg: "#373830",
    bashBorder: "#ae81ff",
  },

  // ANSI terminal colors from VS Code Monokai (microsoft/vscode theme-monokai)
  ansiColors: {
    black: "#333333",
    red: "#c4265e",
    green: "#86b42b",
    yellow: "#b3b42b",
    blue: "#6a7ec8",
    magenta: "#8c6bc8",
    cyan: "#56adbc",
    white: "#e3e3dd",
    brightBlack: "#666666",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#e2e22e",
    brightBlue: "#819aff",
    brightMagenta: "#ae81ff",
    brightCyan: "#66d9ef",
    brightWhite: "#f8f8f2",
  },

  syntaxColors: {
    keyword: "#f92672",
    string: "#e6db74",
    comment: "#75715e",
    number: "#ae81ff",
    type: "#66d9ef",
  },
};
