import type { TextSegment } from "../util/ansi.js";

export type { TextSegment } from "../util/ansi.js";

export interface TerminalLine {
  segments: TextSegment[];
  indent?: number;
  hasGutter?: boolean;
  lineBgColor?: string;
  fontSize?: number;
}

export interface ToolBox {
  toolName: string;
  content: string;
  borderColor: string;
  hasError?: boolean;
  hasSuccess?: boolean;
  contentLineCount: number;
  /** Cached wrapped lines, keyed by maxWidth to avoid re-wrapping every frame */
  _wrappedCache?: { width: number; lines: string[] };
}

export interface InlineTool {
  toolName: string;
  content: string;
  accentColor: string;
  status?: "ok" | "error";
}

export interface SummaryLine {
  text: string;
}

export type RenderItem =
  | { kind: "line"; line: TerminalLine }
  | { kind: "blank" }
  | { kind: "toolbox"; box: ToolBox }
  | { kind: "divider"; text: string; color: string }
  | { kind: "inline_tool"; tool: InlineTool }
  | { kind: "summary"; summary: SummaryLine };

export type ItemKind = "user_prompt" | "assistant_text" | "inline_tool" | "summary" | "toolbox" | "divider" | "blank" | "other";
