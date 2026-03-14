import type { CcreplayConfig } from "../schema.js";
import { dracula } from "./dracula.js";
import { monokai } from "./monokai.js";
import { solarizedDark } from "./solarized-dark.js";
import { light } from "./light.js";

export const THEMES: Record<string, Partial<CcreplayConfig>> = {
  dracula,
  monokai,
  "solarized-dark": solarizedDark,
  light,
};
