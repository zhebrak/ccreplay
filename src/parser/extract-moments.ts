import type { SessionEvent } from "./parse-session.js";
import { EDIT_TOOLS } from "../util/tools.js";
import { findErrorRecoveries } from "../util/error-recovery.js";

export type MomentType =
  | "task_start"
  | "course_correct"
  | "error_recovery"
  | "tests_pass"
  | "big_edit"
  | "model_switch"
  | "outcome"
  | "agent_delegation"
  | "multi_file_burst"
  | "first_pass"
  | "build_success";

export interface KeyMoment {
  type: MomentType;
  eventIndex: number;
  boostMultiplier: number;
}

const PASS_PATTERN = /(?:tests?\s+passed|\bPASS(?:ED)?\b|\ball\s+\d+\s+tests?\b|0\s+fail|compiled\s+successfully|Build\s+succeeded|Build\s+complete)/i;

const BUILD_COMMAND_PATTERN = /(?:npm\s+run\s+build|npx\s+tsc|cargo\s+build|go\s+build|\bmake(?:\s|$)|tsc(?:\s|$)|gradle\s+build|mvn\s+(?:compile|package))/i;

const BOOST: Record<MomentType, number> = {
  task_start: 5,
  outcome: 5,
  tests_pass: 4.5,
  error_recovery: 4,
  course_correct: 4,
  multi_file_burst: 3.5,
  big_edit: 3,
  first_pass: 3,
  build_success: 2.5,
  agent_delegation: 2,
  model_switch: 1.5,
};

export function extractMoments(events: SessionEvent[]): KeyMoment[] {
  const moments: KeyMoment[] = [];

  // 1. Task start: first user prompt
  const firstUserIdx = events.findIndex(e => e.type === "user_prompt");
  if (firstUserIdx >= 0) {
    moments.push({ type: "task_start", eventIndex: firstUserIdx, boostMultiplier: BOOST.task_start });
  }

  // 2. Course corrections: user prompts after 12+ consecutive non-user events
  let consecutiveNonUser = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "user_prompt") {
      if (consecutiveNonUser >= 12 && i !== firstUserIdx) {
        moments.push({ type: "course_correct", eventIndex: i, boostMultiplier: BOOST.course_correct });
      }
      consecutiveNonUser = 0;
    } else {
      consecutiveNonUser++;
    }
  }

  // 3. Error recovery: tool_result error followed by successful tool_result within 10 events
  //    Boost the recovery event, not the error itself. Same tool type required.
  for (const [, recoveryIdx] of findErrorRecoveries(events)) {
    moments.push({ type: "error_recovery", eventIndex: recoveryIdx, boostMultiplier: BOOST.error_recovery });
  }

  // 3b. Tests pass: failed Bash followed by passing Bash within 10 events
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "tool_result" && events[i].toolResult?.isError
        && events[i].toolResult?.toolName === "Bash") {
      for (let j = i + 1; j < Math.min(i + 11, events.length); j++) {
        if (events[j].type === "tool_result" && !events[j].toolResult?.isError
            && events[j].toolResult?.toolName === "Bash"
            && PASS_PATTERN.test(events[j].text)) {
          moments.push({ type: "tests_pass", eventIndex: j, boostMultiplier: BOOST.tests_pass });
          break;
        }
      }
    }
  }

  // 4. Big edits: Edit/Write with 30+ lines
  for (let i = 0; i < events.length; i++) {
    const tc = events[i].toolCall;
    if (tc && EDIT_TOOLS.has(tc.name)) {
      const totalLines = (tc.linesAdded || 0) + (tc.linesRemoved || 0);
      if (totalLines >= 30) {
        moments.push({ type: "big_edit", eventIndex: i, boostMultiplier: BOOST.big_edit });
      }
    }
  }

  // 5. Model switch
  let prevModel = "";
  for (let i = 0; i < events.length; i++) {
    if (events[i].model) {
      if (prevModel && events[i].model !== prevModel) {
        moments.push({ type: "model_switch", eventIndex: i, boostMultiplier: BOOST.model_switch });
      }
      prevModel = events[i].model!;
    }
  }

  // 6. First pass: first Bash result matching PASS_PATTERN (test or build output)
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "tool_result"
        && !events[i].toolResult?.isError
        && events[i].toolResult?.toolName === "Bash"
        && PASS_PATTERN.test(events[i].text)) {
      moments.push({ type: "first_pass", eventIndex: i, boostMultiplier: BOOST.first_pass });
      break;
    }
  }

  // 7. Build success: Bash tool_call with build command followed by non-error result
  let buildSuccessCount = 0;
  for (let i = 0; i < events.length && buildSuccessCount < 3; i++) {
    if (events[i].type === "tool_call"
        && events[i].toolCall?.name === "Bash"
        && BUILD_COMMAND_PATTERN.test(events[i].toolCall?.command || "")) {
      for (let j = i + 1; j < Math.min(i + 3, events.length); j++) {
        if (events[j].type === "tool_result" && events[j].toolResult?.toolName === "Bash") {
          if (!events[j].toolResult?.isError) {
            moments.push({ type: "build_success", eventIndex: j, boostMultiplier: BOOST.build_success });
            buildSuccessCount++;
          }
          break;
        }
      }
    }
  }

  // 8. Multi-file burst: 3+ Edit/Write/MultiEdit calls targeting different files within 8 consecutive tool_calls
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "tool_call" && EDIT_TOOLS.has(events[i].toolCall?.name || "")) {
      const files = new Set<string>();
      if (events[i].toolCall?.filePath) files.add(events[i].toolCall!.filePath!);
      let lastEditIdx = i;
      let toolCallsSeen = 1;
      for (let j = i + 1; j < events.length && toolCallsSeen < 8; j++) {
        if (events[j].type !== "tool_call") continue;
        toolCallsSeen++;
        if (EDIT_TOOLS.has(events[j].toolCall?.name || "")) {
          if (events[j].toolCall?.filePath) files.add(events[j].toolCall!.filePath!);
          lastEditIdx = j;
        }
      }
      if (files.size >= 3) {
        moments.push({ type: "multi_file_burst", eventIndex: lastEditIdx, boostMultiplier: BOOST.multi_file_burst });
        i = lastEditIdx; // skip past burst
      }
    }
  }

  // 9. Agent delegation
  for (let i = 0; i < events.length; i++) {
    if (events[i].toolCall?.name === "Agent") {
      moments.push({ type: "agent_delegation", eventIndex: i, boostMultiplier: BOOST.agent_delegation });
    }
  }

  // 10. Outcome: last assistant text
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "assistant_text" && events[i].text.length > 30) {
      moments.push({ type: "outcome", eventIndex: i, boostMultiplier: BOOST.outcome });
      break;
    }
  }

  // Deduplicate: if two moments target the same event index, keep higher boost
  const byIndex = new Map<number, KeyMoment>();
  for (const m of moments) {
    const existing = byIndex.get(m.eventIndex);
    if (!existing || m.boostMultiplier > existing.boostMultiplier) {
      byIndex.set(m.eventIndex, m);
    }
  }

  return [...byIndex.values()].sort((a, b) => a.eventIndex - b.eventIndex);
}
