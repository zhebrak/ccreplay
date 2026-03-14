import type { CcreplayConfig } from "../schema.js";

export const light: Partial<CcreplayConfig> = {
  colors: {
    accent: "#e45649",
    text: "#383a42",
    dimmed: "#a0a1a7",
    subtle: "#d0d0d0",
    background: "#fafafa",
    success: "#50a14f",
    error: "#e45649",
    warning: "#c18401",
    titleBarBg: "#eaeaec",
    statusBarBg: "#e0e0e2",
    gradientStart: "#ececee",
    gradientEnd: "#e4e4e8",
    codeBg: "#f0f0f2",
    bashBg: "#eceef0",
    bashBorder: "#a626a4",
  },

  ansiColors: {
    black: "#383a42",
    red: "#e45649",
    green: "#50a14f",
    yellow: "#c18401",
    blue: "#4078f2",
    magenta: "#a626a4",
    cyan: "#0184bc",
    white: "#fafafa",
    // Bright variants: HSL-shifted from base One Light colors (no canonical source)
    brightBlack: "#a0a1a7",
    brightRed: "#f26d63",
    brightGreen: "#6abf69",
    brightYellow: "#d4940f",
    brightBlue: "#6797f6",
    brightMagenta: "#bc45ba",
    brightCyan: "#1ea0d7",
    brightWhite: "#ffffff",
  },

  syntaxColors: {
    keyword: "#a626a4",
    string: "#50a14f",
    comment: "#a0a1a7",
    number: "#986801",
    type: "#4078f2",
  },
};
