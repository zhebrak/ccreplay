import { readFileSync } from "fs";
import { mergeStreamingEntries, type RawEntry, type MergedEntry } from "./merge-stream.js";
import { stripAnsi, truncateAnsiAware } from "../util/ansi.js";
import { EDIT_TOOLS } from "../util/tools.js";

export type EventType =
  | "user_prompt"
  | "assistant_text"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "compaction"
  | "gap"
  | "summary";

export interface ToolCallInfo {
  name: string;
  filePath?: string;
  linesAdded?: number;
  linesRemoved?: number;
  command?: string;
  description?: string;
  agentDescription?: string;
}

export interface ToolResultInfo {
  content: string;
  isError: boolean;
  toolName?: string;
}

export interface SessionEvent {
  type: EventType;
  timestamp: number; // ms epoch
  text: string;
  model?: string;
  toolCall?: ToolCallInfo;
  toolResult?: ToolResultInfo;
  tokenUsage?: { input: number; output: number };
}

export interface ParsedSession {
  sessionId: string;
  slug: string;
  model: string;
  events: SessionEvent[];
  startTime: number;
  endTime: number;
  duration: number; // active seconds, excluding idle gaps >15min
  totalTokens: number;
  filesChanged: Set<string>;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  toolCallCount: number;
}

function stripSystemTags(text: string): string {
  return text.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, "").trim();
}

/** Slash commands worth showing in recordings (have narrative significance) */
const NARRATIVE_COMMANDS = new Set(["compact", "exit"]);

/** Extract slash command name from <command-name>/exit</command-name> XML pattern. */
function extractCommandName(text: string): string | null {
  const match = text.match(/^<command-name>\/?(\w[\w-]*)<\/command-name>/);
  return match ? match[1] : null;
}

/** Check if text is a local command output wrapper */
function isLocalCommandOutput(text: string): boolean {
  return /^<local-command-(?:stdout|stderr)>/.test(text);
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return stripSystemTags(content);
  if (Array.isArray(content)) {
    return stripSystemTags(
      content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text || "")
        .join("\n")
    );
  }
  return "";
}

function extractToolCalls(content: unknown): Array<{ name: string; input: Record<string, any>; id?: string }> {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b: any) => b.type === "tool_use")
    .map((b: any) => ({
      name: b.name || "unknown",
      input: b.input || {},
      id: b.id,
    }));
}

function hasThinking(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((b: any) => b.type === "thinking");
}

function extractToolResultsFromUser(content: unknown): Array<{ toolUseId: string; content: string; isError: boolean }> {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b: any) => b.type === "tool_result")
    .map((b: any) => ({
      toolUseId: b.tool_use_id || "",
      content: typeof b.content === "string" ? b.content : "",
      isError: b.is_error === true,
    }));
}

function buildToolCallInfo(name: string, input: Record<string, any>): ToolCallInfo {
  const info: ToolCallInfo = { name };

  switch (name) {
    case "Read":
      info.filePath = input.file_path || input.filePath;
      break;
    case "Edit":
    case "MultiEdit": {
      info.filePath = input.file_path || input.filePath;
      const oldStr = input.old_string || "";
      const newStr = input.new_string || "";
      const oldLines = oldStr ? oldStr.split("\n").length : 0;
      const newLines = newStr ? newStr.split("\n").length : 0;
      info.linesAdded = Math.max(0, newLines - oldLines);
      info.linesRemoved = Math.max(0, oldLines - newLines);
      break;
    }
    case "Write":
      info.filePath = input.file_path || input.filePath;
      if (input.content) {
        info.linesAdded = input.content.split("\n").length;
        info.linesRemoved = 0;
      }
      break;
    case "Bash":
      info.command = input.command;
      info.description = input.description;
      break;
    case "Agent":
      info.agentDescription = input.description || input.prompt?.slice(0, 60);
      break;
    case "Glob":
    case "Grep":
      info.description = input.pattern;
      break;
    default:
      break;
  }

  return info;
}


export function parseSession(filepath: string): ParsedSession {
  let raw: string;
  try {
    raw = readFileSync(filepath, "utf-8");
  } catch (err: any) {
    throw new Error(`Cannot read session file: ${filepath} (${err.code || err.message})`, { cause: err });
  }
  const lines = raw.split("\n").filter(Boolean);

  const rawEntries: RawEntry[] = [];
  for (const line of lines) {
    try {
      rawEntries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const merged = mergeStreamingEntries(rawEntries);
  const events: SessionEvent[] = [];
  const filesChanged = new Set<string>();
  let totalTokens = 0;
  let toolCallCount = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let slug = "";
  let model = "";

  // Build a map of tool_use id -> tool info for matching results
  const toolUseMap = new Map<string, ToolCallInfo>();

  for (const entry of merged) {
    const ts = new Date(entry.timestamp).getTime();
    if (!ts) continue;

    // Extract slug from first entry that has it
    if (!slug && entry.slug) slug = entry.slug;

    if (entry.type === "user") {
      const msg = entry.message;
      if (!msg) continue;

      // Skip meta/injected entries (skill prompts, local-command-caveat)
      if (entry.isMeta) continue;

      // Check if this is a tool result response
      const toolResults = extractToolResultsFromUser(msg.content);
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          const toolInfo = toolUseMap.get(tr.toolUseId);
          const truncated = truncateAnsiAware(tr.content);
          events.push({
            type: "tool_result",
            timestamp: ts,
            text: truncated.text,
            toolResult: {
              content: truncated.rawContent,
              isError: tr.isError,
              toolName: toolInfo?.name,
            },
          });
        }
        continue;
      }

      // Regular user message
      const text = extractTextContent(msg.content);

      // Slash command entry: <command-name>/exit</command-name>...
      const commandName = extractCommandName(text);
      if (commandName !== null) {
        if (NARRATIVE_COMMANDS.has(commandName)) {
          events.push({ type: "user_prompt", timestamp: ts, text: `/${commandName}` });
        }
        continue;
      }

      // Local command output: <local-command-stdout>...</local-command-stdout>
      if (isLocalCommandOutput(text)) continue;

      if (text.trim()) {
        // Skip continuation context messages (from compaction)
        if (text.startsWith("This session is being continued from a previous conversation")) {
          continue;
        }
        events.push({
          type: "user_prompt",
          timestamp: ts,
          text: text.trim(),
        });
      }
    } else if (entry.type === "assistant") {
      const msg = entry.message;
      if (!msg) continue;

      if (msg.model) model = msg.model;

      // Accumulate tokens
      if (msg.usage) {
        const u = msg.usage;
        const tokens = (u.input_tokens || 0) + (u.output_tokens || 0);
        totalTokens += tokens;
      }

      // Check for thinking
      if (hasThinking(msg.content)) {
        events.push({
          type: "thinking",
          timestamp: ts,
          text: "Thinking\u2026",
          model: msg.model,
        });
      }

      // Extract text content
      const text = extractTextContent(msg.content);
      if (text.trim()) {
        events.push({
          type: "assistant_text",
          timestamp: ts,
          text: text.trim(),
          model: msg.model,
          tokenUsage: msg.usage ? {
            input: msg.usage.input_tokens || 0,
            output: msg.usage.output_tokens || 0,
          } : undefined,
        });
      }

      // Extract tool calls
      const toolCalls = extractToolCalls(msg.content);
      for (const tc of toolCalls) {
        const info = buildToolCallInfo(tc.name, tc.input);
        if (tc.id) toolUseMap.set(tc.id, info);
        toolCallCount++;

        // Track files and line changes
        if (info.filePath && EDIT_TOOLS.has(tc.name)) {
          filesChanged.add(info.filePath);
          totalLinesAdded += info.linesAdded || 0;
          totalLinesRemoved += info.linesRemoved || 0;
        }

        events.push({
          type: "tool_call",
          timestamp: ts,
          text: formatToolCallText(info),
          toolCall: info,
        });
      }
    } else if (entry.type === "system" && entry.subtype === "compact_boundary") {
      events.push({
        type: "compaction",
        timestamp: ts,
        text: "context compacted",
      });
    }
  }

  // Compute active session duration (excluding idle gaps > 15 min)
  const GAP_THRESHOLD_MS = 15 * 60 * 1000;
  const eventTimestamps = events
    .map(e => e.timestamp)
    .filter(Boolean);

  let activeDurationMs = 0;
  for (let i = 1; i < eventTimestamps.length; i++) {
    const gap = eventTimestamps[i] - eventTimestamps[i - 1];
    if (gap <= GAP_THRESHOLD_MS) {
      activeDurationMs += gap;
    }
  }
  const startTime = eventTimestamps.length > 0 ? eventTimestamps[0] : 0;
  const endTime = eventTimestamps.length > 0 ? eventTimestamps[eventTimestamps.length - 1] : 0;
  const duration = activeDurationMs / 1000;

  // Extract session ID from filepath
  const sessionId = filepath.split("/").pop()?.replace(/\.jsonl$/, "") || "unknown";

  return {
    sessionId,
    slug: slug || sessionId.slice(0, 8),
    model,
    events,
    startTime,
    endTime,
    duration,
    totalTokens,
    filesChanged,
    totalLinesAdded,
    totalLinesRemoved,
    toolCallCount,
  };
}

function formatToolCallText(info: ToolCallInfo): string {
  switch (info.name) {
    case "Read":
      return info.filePath || "";
    case "Edit":
    case "MultiEdit": {
      const path = info.filePath || "";
      const added = info.linesAdded || 0;
      const removed = info.linesRemoved || 0;
      return `${path} (+${added}, -${removed})`;
    }
    case "Write": {
      const path = info.filePath || "";
      const added = info.linesAdded || 0;
      return `${path} (+${added})`;
    }
    case "Bash":
      return info.description || info.command || "";
    case "Agent":
      return info.agentDescription || "";
    case "Glob":
    case "Grep":
      return info.description || "";
    default:
      return info.name;
  }
}
