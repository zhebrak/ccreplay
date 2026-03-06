import type { SessionEvent } from "../parser/parse-session.js";

/**
 * Scan for error→recovery pairs: a tool_result error followed by a
 * successful tool_result of the same tool within `windowSize` events.
 * Returns Map<errorEventIndex, recoveryEventIndex>.
 */
export function findErrorRecoveries(events: SessionEvent[], windowSize = 10): Map<number, number> {
  const recoveries = new Map<number, number>();
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "tool_result" && events[i].toolResult?.isError) {
      const errorToolName = events[i].toolResult?.toolName;
      for (let j = i + 1; j < Math.min(i + windowSize + 1, events.length); j++) {
        if (events[j].type === "tool_result" && !events[j].toolResult?.isError
            && events[j].toolResult?.toolName === errorToolName) {
          recoveries.set(i, j);
          break;
        }
      }
    }
  }
  return recoveries;
}
