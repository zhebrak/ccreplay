import type { SessionEvent } from "../parser/parse-session.js";
import type { KeyMoment } from "../parser/extract-moments.js";
import type { TimelineEntry } from "./types.js";
import { wordCount } from "../util/format.js";
import { EDIT_TOOLS, NARRATIVE_TOOLS } from "../util/tools.js";
import { findErrorRecoveries } from "../util/error-recovery.js";

const GAP_THRESHOLD_MS = 30_000; // 30s gap

interface BaseBudgets {
  user_prompt: (text: string) => number;
  assistant_text: (text: string) => number;
  tool_call: (ev: SessionEvent) => number;
  tool_result: (isError: boolean, ev: SessionEvent) => number;
  thinking: () => number;
  compaction: () => number;
  gap: () => number;
  summary: () => number;
}

const BUDGETS: BaseBudgets = {
  user_prompt: (text) => Math.min(6000, 2000 + wordCount(text) * 40),
  assistant_text: (text) => Math.min(5000, 800 + wordCount(text) * 35),
  tool_call: (ev) => {
    const tc = ev.toolCall;
    if (!tc) return 300;
    switch (tc.name) {
      case "Edit":
      case "MultiEdit":
        return Math.min(1500, 400 + ((tc.linesAdded || 0) + (tc.linesRemoved || 0)) * 8);
      case "Write":
        return Math.min(1500, 400 + (tc.linesAdded || 0) * 8);
      case "Bash": return 600;
      case "Agent": return 800;
      default: return 300;
    }
  },
  tool_result: (isError, ev) => {
    if (isError) return 2000;
    if (ev.toolResult?.toolName === "Bash" && ev.toolResult.content.trim()) {
      return Math.min(1200, 400 + wordCount(ev.text) * 30);
    }
    return 300;
  },
  thinking: () => 200,
  compaction: () => 300,
  gap: () => 300,
  summary: () => 600,
};

const MIN_FLOORS: Record<string, number> = {
  user_prompt: 1500,
  assistant_text: 500,
  tool_call: 150,
  tool_result_ok: 100,
  tool_result_error: 500,
  thinking: 100,
  compaction: 300,
  gap: 100,
  summary: 200,
};

/**
 * Filter events to keep only what matters for the video narrative.
 * Returns a filtered array plus any synthetic summary events.
 */
export function filterEvents(events: SessionEvent[], moments: KeyMoment[]): SessionEvent[] {
  const momentIndices = new Set(moments.map(m => m.eventIndex));

  // Build error-fix recovery set: mark successful results after errors
  const errorFixKeep = new Set(findErrorRecoveries(events).values());

  const filtered: SessionEvent[] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];

    // Always drop thinking and gap events
    if (ev.type === "thinking" || ev.type === "gap") {
      i++;
      continue;
    }

    // Always keep user_prompt
    if (ev.type === "user_prompt") {
      filtered.push(ev);
      i++;
      continue;
    }

    // Keep assistant_text only if >= 5 words
    if (ev.type === "assistant_text") {
      if (wordCount(ev.text) >= 5) {
        filtered.push(ev);
      }
      i++;
      continue;
    }

    // Always keep compaction
    if (ev.type === "compaction") {
      filtered.push(ev);
      i++;
      continue;
    }

    // Tool calls
    if (ev.type === "tool_call") {
      const toolName = ev.toolCall?.name || "";

      if (NARRATIVE_TOOLS.has(toolName)) {
        // Keep narrative tool calls
        filtered.push(ev);
        i++;
        continue;
      }

      // All non-narrative tools: collapse consecutive runs into a summary
      const routineStart = i;
      let readCount = 0;
      let searchCount = 0;
      let otherCount = 0;
      while (i < events.length) {
        const cur = events[i];
        // Absorb non-narrative tool_calls
        if (cur.type === "tool_call" && !NARRATIVE_TOOLS.has(cur.toolCall?.name || "")) {
          if (cur.toolCall?.name === "Read") readCount++;
          else if (cur.toolCall?.name === "Glob" || cur.toolCall?.name === "Grep") searchCount++;
          else otherCount++;
          i++;
          continue;
        }
        // Absorb successful tool_results for non-narrative tools
        if (cur.type === "tool_result" && !cur.toolResult?.isError
            && !NARRATIVE_TOOLS.has(cur.toolResult?.toolName || "")) {
          i++;
          continue;
        }
        // Absorb short assistant_text within routine runs (< 5 words)
        if (cur.type === "assistant_text" && wordCount(cur.text) < 5) {
          i++;
          continue;
        }
        break;
      }
      const totalRoutine = readCount + searchCount + otherCount;
      if (totalRoutine >= 2) {
        // Create summary event for groups of 2+
        const parts: string[] = [];
        if (readCount > 0) parts.push(`Read ${readCount} file${readCount > 1 ? "s" : ""}`);
        if (searchCount > 0) parts.push(`searched codebase (${searchCount} quer${searchCount > 1 ? "ies" : "y"})`);
        if (otherCount > 0) parts.push(`${otherCount} other tool${otherCount > 1 ? "s" : ""}`);
        filtered.push({
          type: "summary" as any,
          timestamp: events[routineStart].timestamp,
          text: parts.join(", "),
        });
      }
      // Single routine tools are silently dropped
      continue;
    }

    // Tool results
    if (ev.type === "tool_result") {
      // Keep error results only for narrative tools (Bash errors, Edit failures, etc.)
      if (ev.toolResult?.isError && NARRATIVE_TOOLS.has(ev.toolResult?.toolName || "")) {
        filtered.push(ev);
        i++;
        continue;
      }

      // Keep if marked as error-fix recovery
      if (errorFixKeep.has(i)) {
        filtered.push(ev);
        i++;
        continue;
      }

      // Keep successful Bash results (test output, build logs) — but only if non-empty
      if (ev.toolResult?.toolName === "Bash" && !ev.toolResult?.isError) {
        if (ev.toolResult.content.trim()) {
          filtered.push(ev);
        }
        i++;
        continue;
      }

      // Drop all other successful results (tool_call already shows the info,
      // or it was absorbed in a summary)
      i++;
      continue;
    }

    // Default: keep
    filtered.push(ev);
    i++;
  }

  return filtered;
}

export function buildTimeline(events: SessionEvent[], moments: KeyMoment[]): TimelineEntry[] {
  const momentMap = new Map<number, KeyMoment>();
  for (const m of moments) {
    momentMap.set(m.eventIndex, m);
  }

  // Accumulate counters from the ORIGINAL unfiltered events
  const filesSet = new Set<string>();
  let cumulativeTokens = 0;
  let cumulativeToolCalls = 0;
  // Map from timestamp to cumulative state at that point
  const cumulativeAt = new Map<number, { tokens: number; files: number; tools: number }>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.tokenUsage) {
      cumulativeTokens += event.tokenUsage.input + event.tokenUsage.output;
    }
    if (event.type === "tool_call") {
      cumulativeToolCalls++;
      const fp = event.toolCall?.filePath;
      if (fp && EDIT_TOOLS.has(event.toolCall!.name)) {
        filesSet.add(fp);
      }
    }
    cumulativeAt.set(event.timestamp, {
      tokens: cumulativeTokens,
      files: filesSet.size,
      tools: cumulativeToolCalls,
    });
  }

  // Filter events to keep only what matters
  const filtered = filterEvents(events, moments);

  const entries: TimelineEntry[] = [];

  // Build identity map for O(1) original-index lookups
  const eventIndexMap = new Map<SessionEvent, number>();
  for (let i = 0; i < events.length; i++) {
    eventIndexMap.set(events[i], i);
  }

  // Find the closest cumulative state for a timestamp
  function getCumulative(ts: number) {
    const exact = cumulativeAt.get(ts);
    if (exact) return exact;
    // Fallback: find closest earlier timestamp
    let best = { tokens: 0, files: 0, tools: 0 };
    for (const [t, v] of cumulativeAt) {
      if (t <= ts) best = v;
    }
    return best;
  }

  for (let i = 0; i < filtered.length; i++) {
    const event = filtered[i];

    // Compute base budget
    let baseBudgetMs: number;
    const eventType = event.type as string;
    switch (eventType) {
      case "user_prompt":
        baseBudgetMs = BUDGETS.user_prompt(event.text);
        break;
      case "assistant_text":
        baseBudgetMs = BUDGETS.assistant_text(event.text);
        break;
      case "tool_call":
        baseBudgetMs = BUDGETS.tool_call(event);
        break;
      case "tool_result":
        baseBudgetMs = BUDGETS.tool_result(event.toolResult?.isError || false, event);
        break;
      case "compaction":
        baseBudgetMs = BUDGETS.compaction();
        break;
      case "summary":
        baseBudgetMs = BUDGETS.summary();
        break;
      default:
        baseBudgetMs = 200;
    }

    // Find original event index for moment matching
    const origIdx = eventIndexMap.get(event) ?? -1;
    const moment = origIdx >= 0 ? momentMap.get(origIdx) : undefined;

    const cum = getCumulative(event.timestamp);

    entries.push({
      event,
      eventIndex: origIdx >= 0 ? origIdx : -1,
      baseBudgetMs,
      boostMultiplier: moment?.boostMultiplier || 1,
      isKeyMoment: !!moment,
      paddingMs: 0,
      cumulativeTokens: cum.tokens,
      cumulativeFiles: cum.files,
      cumulativeToolCalls: cum.tools,
    });
  }

  // Assign breathing-room padding between entries
  for (let i = 0; i < entries.length; i++) {
    let padding = 0;
    const evType = entries[i].event.type as string;
    const nextEvType = i + 1 < entries.length ? (entries[i + 1].event.type as string) : null;

    if (evType === "user_prompt") padding = Math.max(padding, 600);
    if (evType === "tool_result" && entries[i].event.toolResult?.isError) padding = Math.max(padding, 400);
    if (entries[i].isKeyMoment) padding = Math.max(padding, 300);
    if (evType === "assistant_text" && nextEvType === "tool_call") padding = Math.max(padding, 200);

    entries[i].paddingMs = padding;
  }

  return entries;
}
