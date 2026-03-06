import { describe, it, expect } from "vitest";
import { extractMoments, type MomentType } from "../src/parser/extract-moments.js";
import type { SessionEvent, EventType } from "../src/parser/parse-session.js";

function ev(type: EventType, overrides: Partial<SessionEvent> = {}): SessionEvent {
  return { type, timestamp: Date.now(), text: "", ...overrides };
}

function toolCall(name: string, extra: Partial<SessionEvent["toolCall"]> = {}): SessionEvent {
  return ev("tool_call", { toolCall: { name, ...extra } });
}

function toolResult(toolName: string, content = "", isError = false): SessionEvent {
  return ev("tool_result", {
    text: content,
    toolResult: { content, isError, toolName },
  });
}

function findMoment(moments: ReturnType<typeof extractMoments>, type: MomentType) {
  return moments.find(m => m.type === type);
}

function findAllMoments(moments: ReturnType<typeof extractMoments>, type: MomentType) {
  return moments.filter(m => m.type === type);
}

describe("extractMoments", () => {
  describe("first_pass", () => {
    it("fires on first passing Bash result", () => {
      const events = [
        ev("user_prompt", { text: "run tests" }),
        toolCall("Bash", { command: "npm test" }),
        toolResult("Bash", "5 tests passed"),
        toolCall("Bash", { command: "npm test" }),
        toolResult("Bash", "5 tests passed"),
      ];
      const moments = extractMoments(events);
      const fp = findMoment(moments, "first_pass");
      expect(fp).toBeDefined();
      expect(fp!.eventIndex).toBe(2); // first pass result
      expect(fp!.boostMultiplier).toBe(3);
    });

    it("fires only once", () => {
      const events = [
        ev("user_prompt", { text: "run tests" }),
        toolCall("Bash", { command: "npm test" }),
        toolResult("Bash", "PASSED"),
        toolCall("Bash", { command: "npm test" }),
        toolResult("Bash", "PASSED"),
      ];
      const moments = extractMoments(events);
      const fps = findAllMoments(moments, "first_pass");
      expect(fps.length).toBe(1);
    });

    it("is deduped by tests_pass when preceded by error (higher boost wins)", () => {
      const events = [
        ev("user_prompt", { text: "fix test" }),
        toolCall("Bash", { command: "npm test" }),
        toolResult("Bash", "FAILED", true),
        toolCall("Bash", { command: "npm test" }),
        toolResult("Bash", "5 tests passed"),
      ];
      const moments = extractMoments(events);
      // Both first_pass and tests_pass target index 4; tests_pass (4.5) wins
      const atIdx4 = moments.find(m => m.eventIndex === 4);
      expect(atIdx4).toBeDefined();
      expect(atIdx4!.type).toBe("tests_pass");
      expect(atIdx4!.boostMultiplier).toBe(4.5);
    });
  });

  describe("build_success", () => {
    it("fires on npm run build + success", () => {
      const events = [
        ev("user_prompt", { text: "build it" }),
        toolCall("Bash", { command: "npm run build" }),
        toolResult("Bash", "done in 2.3s"),
      ];
      const moments = extractMoments(events);
      const bs = findMoment(moments, "build_success");
      expect(bs).toBeDefined();
      expect(bs!.eventIndex).toBe(2);
      expect(bs!.boostMultiplier).toBe(2.5);
    });

    it("does NOT fire on error result", () => {
      const events = [
        ev("user_prompt", { text: "build it" }),
        toolCall("Bash", { command: "npm run build" }),
        toolResult("Bash", "error TS2322", true),
      ];
      const moments = extractMoments(events);
      expect(findMoment(moments, "build_success")).toBeUndefined();
    });

    it("caps at 3 occurrences", () => {
      const events: SessionEvent[] = [ev("user_prompt", { text: "build" })];
      for (let i = 0; i < 5; i++) {
        events.push(toolCall("Bash", { command: "npm run build" }));
        events.push(toolResult("Bash", "ok"));
      }
      const moments = extractMoments(events);
      expect(findAllMoments(moments, "build_success").length).toBe(3);
    });
  });

  describe("multi_file_burst", () => {
    it("fires with 3+ different files in 8 consecutive tool_calls", () => {
      const events = [
        ev("user_prompt", { text: "refactor" }),
        toolCall("Edit", { filePath: "a.ts" }),
        toolResult("Edit"),
        toolCall("Edit", { filePath: "b.ts" }),
        toolResult("Edit"),
        toolCall("Edit", { filePath: "c.ts" }),
        toolResult("Edit"),
      ];
      const moments = extractMoments(events);
      const mfb = findMoment(moments, "multi_file_burst");
      expect(mfb).toBeDefined();
      expect(mfb!.boostMultiplier).toBe(3.5);
      // Attaches to last edit in burst
      expect(mfb!.eventIndex).toBe(5);
    });

    it("does NOT fire with fewer than 3 unique files", () => {
      const events = [
        ev("user_prompt", { text: "edit" }),
        toolCall("Edit", { filePath: "a.ts" }),
        toolResult("Edit"),
        toolCall("Edit", { filePath: "a.ts" }),
        toolResult("Edit"),
        toolCall("Edit", { filePath: "b.ts" }),
        toolResult("Edit"),
      ];
      const moments = extractMoments(events);
      expect(findMoment(moments, "multi_file_burst")).toBeUndefined();
    });

    it("does NOT fire when edits span more than 8 tool_calls", () => {
      // 3 edit tool_calls but with 6 non-edit tool_calls between them = 9 total tool_calls
      const events: SessionEvent[] = [ev("user_prompt", { text: "spread out" })];
      events.push(toolCall("Edit", { filePath: "a.ts" }));
      events.push(toolResult("Edit"));
      // 6 intervening tool_calls to exceed the 8-tool_call window
      for (let i = 0; i < 6; i++) {
        events.push(toolCall("Read", { filePath: `file${i}.ts` }));
        events.push(toolResult("Read"));
      }
      events.push(toolCall("Edit", { filePath: "b.ts" }));
      events.push(toolResult("Edit"));
      events.push(toolCall("Edit", { filePath: "c.ts" }));
      events.push(toolResult("Edit"));
      const moments = extractMoments(events);
      expect(findMoment(moments, "multi_file_burst")).toBeUndefined();
    });

    it("does not produce overlapping detections", () => {
      // Two bursts separated by enough non-edit tool_calls to exceed the 8-tool_call window
      const events: SessionEvent[] = [ev("user_prompt", { text: "lots of edits" })];
      // First burst: a, b, c
      events.push(toolCall("Edit", { filePath: "a.ts" }));
      events.push(toolResult("Edit"));
      events.push(toolCall("Edit", { filePath: "b.ts" }));
      events.push(toolResult("Edit"));
      events.push(toolCall("Edit", { filePath: "c.ts" }));
      events.push(toolResult("Edit"));
      // 8 non-edit tool_calls to separate the bursts
      for (let i = 0; i < 8; i++) {
        events.push(toolCall("Read", { filePath: `read${i}.ts` }));
        events.push(toolResult("Read"));
      }
      // Second burst: d, e, f
      events.push(toolCall("Edit", { filePath: "d.ts" }));
      events.push(toolResult("Edit"));
      events.push(toolCall("Edit", { filePath: "e.ts" }));
      events.push(toolResult("Edit"));
      events.push(toolCall("Edit", { filePath: "f.ts" }));
      events.push(toolResult("Edit"));
      const moments = extractMoments(events);
      const bursts = findAllMoments(moments, "multi_file_burst");
      expect(bursts.length).toBe(2);
      expect(bursts[0].eventIndex).not.toBe(bursts[1].eventIndex);
    });
  });

  describe("compact removal", () => {
    it("compaction events produce no compact moment", () => {
      const events = [
        ev("user_prompt", { text: "start" }),
        ev("compaction"),
        ev("assistant_text", { text: "Here is a summary of what we have done so far in this session." }),
      ];
      const moments = extractMoments(events);
      expect(findMoment(moments, "compact" as MomentType)).toBeUndefined();
    });
  });

  describe("big_edit threshold", () => {
    it("fires at 30 lines", () => {
      const events = [
        ev("user_prompt", { text: "edit" }),
        toolCall("Edit", { filePath: "a.ts", linesAdded: 30, linesRemoved: 0 }),
      ];
      const moments = extractMoments(events);
      expect(findMoment(moments, "big_edit")).toBeDefined();
    });

    it("does not fire at 29 lines", () => {
      const events = [
        ev("user_prompt", { text: "edit" }),
        toolCall("Edit", { filePath: "a.ts", linesAdded: 20, linesRemoved: 9 }),
      ];
      const moments = extractMoments(events);
      expect(findMoment(moments, "big_edit")).toBeUndefined();
    });
  });

  describe("error_recovery window", () => {
    it("fires when success is 9 events after error", () => {
      const events: SessionEvent[] = [ev("user_prompt", { text: "fix" })];
      events.push(toolResult("Bash", "error", true));
      // 8 intervening events
      for (let i = 0; i < 8; i++) {
        events.push(ev("assistant_text", { text: "thinking about the fix and what to do next" }));
      }
      events.push(toolResult("Bash", "success"));
      const moments = extractMoments(events);
      expect(findMoment(moments, "error_recovery")).toBeDefined();
    });

    it("does NOT fire when success is 11 events after error", () => {
      const events: SessionEvent[] = [ev("user_prompt", { text: "fix" })];
      events.push(toolResult("Bash", "error", true));
      // 10 intervening events
      for (let i = 0; i < 10; i++) {
        events.push(ev("assistant_text", { text: "thinking about the fix and what to do next" }));
      }
      events.push(toolResult("Bash", "success"));
      const moments = extractMoments(events);
      expect(findMoment(moments, "error_recovery")).toBeUndefined();
    });

    it("requires same tool type (Bash error + Read success = no match)", () => {
      const events = [
        ev("user_prompt", { text: "fix" }),
        toolResult("Bash", "command failed", true),
        toolResult("Read", "file contents"),
      ];
      const moments = extractMoments(events);
      expect(findMoment(moments, "error_recovery")).toBeUndefined();
    });
  });

  describe("model_switch boost", () => {
    it("has boost of 1.5", () => {
      const events = [
        ev("user_prompt", { text: "start" }),
        ev("assistant_text", { text: "Here is a summary of what I have been working on.", model: "claude-sonnet" }),
        ev("assistant_text", { text: "Switching models now.", model: "claude-opus" }),
        // Later text so outcome doesn't land on model_switch event
        ev("assistant_text", { text: "Here is the final result of all the work I have done." }),
      ];
      const moments = extractMoments(events);
      const ms = findMoment(moments, "model_switch");
      expect(ms).toBeDefined();
      expect(ms!.boostMultiplier).toBe(1.5);
    });
  });

  describe("PASS_PATTERN matches build output", () => {
    it.each([
      "compiled successfully",
      "Build succeeded",
      "Build complete",
      "5 tests passed",
      "PASSED",
      "all 12 tests",
      "0 fail",
    ])("matches: %s", (text) => {
      const events = [
        ev("user_prompt", { text: "build" }),
        toolCall("Bash", { command: "npm run build" }),
        toolResult("Bash", text),
      ];
      const moments = extractMoments(events);
      // Should match as first_pass (PASS_PATTERN match on Bash result)
      const fp = findMoment(moments, "first_pass");
      expect(fp).toBeDefined();
    });
  });
});
