import { describe, it, expect } from "vitest";
import { join } from "path";
import { writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { parseSession } from "../src/parser/parse-session.js";

const FIXTURE = join(__dirname, "fixtures", "minimal-session.jsonl");

describe("parseSession", () => {
  it("parses a minimal session", () => {
    const session = parseSession(FIXTURE);
    expect(session.slug).toBe("test-session");
    expect(session.model).toBe("claude-opus-4-6");
    expect(session.events.length).toBeGreaterThan(0);
  });

  it("extracts user prompts", () => {
    const session = parseSession(FIXTURE);
    const userEvents = session.events.filter(e => e.type === "user_prompt");
    expect(userEvents.length).toBe(1);
    expect(userEvents[0].text).toBe("Fix the login bug");
  });

  it("extracts assistant text", () => {
    const session = parseSession(FIXTURE);
    const textEvents = session.events.filter(e => e.type === "assistant_text");
    expect(textEvents.length).toBeGreaterThanOrEqual(2);
    expect(textEvents[0].text).toContain("auth code");
  });

  it("extracts tool calls", () => {
    const session = parseSession(FIXTURE);
    const toolCalls = session.events.filter(e => e.type === "tool_call");
    expect(toolCalls.length).toBe(3); // Read, Edit, Bash
    expect(toolCalls[0].toolCall?.name).toBe("Read");
    expect(toolCalls[1].toolCall?.name).toBe("Edit");
    expect(toolCalls[2].toolCall?.name).toBe("Bash");
  });

  it("tracks files changed", () => {
    const session = parseSession(FIXTURE);
    expect(session.filesChanged.has("src/auth.ts")).toBe(true);
  });

  it("accumulates total lines added/removed", () => {
    const session = parseSession(FIXTURE);
    // Fixture has one Edit: old_string 1 line -> new_string 2 lines = +1 -0
    expect(session.totalLinesAdded).toBe(1);
    expect(session.totalLinesRemoved).toBe(0);
  });

  it("computes duration", () => {
    const session = parseSession(FIXTURE);
    expect(session.duration).toBeGreaterThan(0);
    expect(session.duration).toBeLessThan(60);
  });

  it("excludes idle gaps from duration", () => {
    // Build events: 5 min active, 2 hour gap, 5 min active
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-test-"));
    const tmpFile = join(tmpDir, "idle-gap-session.jsonl");
    const base = new Date("2026-03-01T10:00:00.000Z").getTime();
    const min = 60 * 1000;
    const hour = 60 * min;
    const lines = [
      { type: "user", message: { role: "user", content: "First prompt" }, uuid: "a1", slug: "idle-test", timestamp: new Date(base).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_1", model: "claude-opus-4-6", content: [{ type: "text", text: "Response 1" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "a2", slug: "idle-test", timestamp: new Date(base + 5 * min).toISOString() },
      // 2 hour idle gap
      { type: "user", message: { role: "user", content: "Second prompt" }, uuid: "a3", slug: "idle-test", timestamp: new Date(base + 2 * hour + 5 * min).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_2", model: "claude-opus-4-6", content: [{ type: "text", text: "Response 2" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "a4", slug: "idle-test", timestamp: new Date(base + 2 * hour + 10 * min).toISOString() },
    ];
    writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");

    const session = parseSession(tmpFile);
    // Active duration should be exactly 10 min (5 + 5), not ~2h 10min
    expect(session.duration).toBe(600);

    rmSync(tmpDir, { recursive: true });
  });

  it("strips task-notification XML tags from user messages", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-test-"));
    const tmpFile = join(tmpDir, "task-notification-session.jsonl");
    const base = new Date("2026-03-01T10:00:00.000Z").getTime();
    const lines = [
      { type: "user", message: { role: "user", content: "Initial prompt" }, uuid: "t1", slug: "task-test", timestamp: new Date(base).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_t1", model: "claude-opus-4-6", content: [{ type: "text", text: "Working on it" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "t2", slug: "task-test", timestamp: new Date(base + 1000).toISOString() },
      { type: "user", message: { role: "user", content: '<task-notification>\n<task-id>aaacb37209538d230</task-id>\n<tool-use-id>toolu_01EFGHBceaX7rSzXatodzDjY</tool-use-id>\n<status>completed</status>\n<summary>Agent "Code reuse agent" completed</summary>\n<result>Done</result>\n</task-notification>' }, uuid: "t3", slug: "task-test", timestamp: new Date(base + 2000).toISOString() },
      { type: "user", message: { role: "user", content: 'Some text before\n<task-notification>\n<task-id>abc</task-id>\n<status>completed</status>\n<result>Done</result>\n</task-notification>\nSome text after' }, uuid: "t4", slug: "task-test", timestamp: new Date(base + 3000).toISOString() },
    ];
    writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");

    const session = parseSession(tmpFile);
    const userEvents = session.events.filter(e => e.type === "user_prompt");

    // First user prompt is fine
    expect(userEvents[0].text).toBe("Initial prompt");
    // Pure task-notification message should be stripped entirely (empty -> not added)
    // Mixed message should have task-notification stripped but keep surrounding text
    const hasRawXml = userEvents.some(e => e.text.includes("<task-notification>"));
    expect(hasRawXml).toBe(false);
    // The mixed message should preserve surrounding text
    const mixedEvent = userEvents.find(e => e.text.includes("Some text"));
    expect(mixedEvent).toBeDefined();
    expect(mixedEvent!.text).toContain("Some text before");
    expect(mixedEvent!.text).toContain("Some text after");

    rmSync(tmpDir, { recursive: true });
  });

  it("merges streaming entries by message.id", () => {
    const session = parseSession(FIXTURE);
    // msg_001 has text in first entry and tool_use in second
    // Both should appear as separate events
    const textEvents = session.events.filter(e => e.type === "assistant_text");
    const toolEvents = session.events.filter(e => e.type === "tool_call");
    expect(textEvents.some(e => e.text.includes("auth code"))).toBe(true);
    expect(toolEvents.some(e => e.toolCall?.name === "Read")).toBe(true);
  });

  it("skips isMeta entries (skill injections, local-command-caveat)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-test-"));
    const tmpFile = join(tmpDir, "meta-session.jsonl");
    const base = new Date("2026-03-01T10:00:00.000Z").getTime();
    const lines = [
      { type: "user", message: { role: "user", content: "Real prompt" }, uuid: "m1", slug: "meta-test", timestamp: new Date(base).toISOString() },
      // local-command-caveat (isMeta=true)
      { type: "user", message: { role: "user", content: "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>" }, isMeta: true, uuid: "m2", timestamp: new Date(base + 1000).toISOString() },
      // Skill injection (isMeta=true)
      { type: "user", message: { role: "user", content: [{ type: "text", text: "Run a combined code review and simplification analysis on the changes you just made:" }] }, isMeta: true, uuid: "m3", timestamp: new Date(base + 2000).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_m1", model: "claude-opus-4-6", content: [{ type: "text", text: "Working on it" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "m4", timestamp: new Date(base + 3000).toISOString() },
    ];
    writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");

    const session = parseSession(tmpFile);
    const userEvents = session.events.filter(e => e.type === "user_prompt");
    expect(userEvents.length).toBe(1);
    expect(userEvents[0].text).toBe("Real prompt");

    rmSync(tmpDir, { recursive: true });
  });

  it("emits user_prompt for narrative slash commands (/compact, /exit)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-test-"));
    const tmpFile = join(tmpDir, "command-session.jsonl");
    const base = new Date("2026-03-01T10:00:00.000Z").getTime();
    const lines = [
      { type: "user", message: { role: "user", content: "Real prompt" }, uuid: "c1", slug: "cmd-test", timestamp: new Date(base).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_c1", model: "claude-opus-4-6", content: [{ type: "text", text: "Done" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "c2", timestamp: new Date(base + 1000).toISOString() },
      // /compact command
      { type: "user", message: { role: "user", content: "<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>" }, uuid: "c3", timestamp: new Date(base + 2000).toISOString() },
      // /compact output
      { type: "user", message: { role: "user", content: "<local-command-stdout>\x1b[2mCompacted (ctrl+o to see full summary)\x1b[22m</local-command-stdout>" }, uuid: "c4", timestamp: new Date(base + 2001).toISOString() },
    ];
    writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");

    const session = parseSession(tmpFile);
    const userEvents = session.events.filter(e => e.type === "user_prompt");
    expect(userEvents.length).toBe(2);
    expect(userEvents[0].text).toBe("Real prompt");
    expect(userEvents[1].text).toBe("/compact");

    rmSync(tmpDir, { recursive: true });
  });

  it("skips non-narrative slash commands (/usage, /mcp, etc.)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-test-"));
    const tmpFile = join(tmpDir, "skip-cmd-session.jsonl");
    const base = new Date("2026-03-01T10:00:00.000Z").getTime();
    const lines = [
      { type: "user", message: { role: "user", content: "Real prompt" }, uuid: "s1", slug: "skip-test", timestamp: new Date(base).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_s1", model: "claude-opus-4-6", content: [{ type: "text", text: "Done" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "s2", timestamp: new Date(base + 1000).toISOString() },
      // /usage command (non-narrative)
      { type: "user", message: { role: "user", content: "<command-name>/usage</command-name>\n            <command-message>usage</command-message>\n            <command-args></command-args>" }, uuid: "s3", timestamp: new Date(base + 2000).toISOString() },
      // /usage output
      { type: "user", message: { role: "user", content: "<local-command-stdout>Status dialog dismissed</local-command-stdout>" }, uuid: "s4", timestamp: new Date(base + 2001).toISOString() },
    ];
    writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");

    const session = parseSession(tmpFile);
    const userEvents = session.events.filter(e => e.type === "user_prompt");
    expect(userEvents.length).toBe(1);
    expect(userEvents[0].text).toBe("Real prompt");

    rmSync(tmpDir, { recursive: true });
  });

  it("handles full 3-message local command sequence", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ccreplay-test-"));
    const tmpFile = join(tmpDir, "full-cmd-session.jsonl");
    const base = new Date("2026-03-01T10:00:00.000Z").getTime();
    const lines = [
      { type: "user", message: { role: "user", content: "Real prompt" }, uuid: "f1", slug: "full-test", timestamp: new Date(base).toISOString() },
      { type: "assistant", message: { role: "assistant", id: "msg_f1", model: "claude-opus-4-6", content: [{ type: "text", text: "Done" }], usage: { input_tokens: 10, output_tokens: 10 } }, uuid: "f2", timestamp: new Date(base + 1000).toISOString() },
      // Caveat (isMeta=true)
      { type: "user", message: { role: "user", content: "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages.</local-command-caveat>" }, isMeta: true, uuid: "f3", timestamp: new Date(base + 2000).toISOString() },
      // /exit command
      { type: "user", message: { role: "user", content: "<command-name>/exit</command-name>\n            <command-message>exit</command-message>\n            <command-args></command-args>" }, uuid: "f4", timestamp: new Date(base + 2001).toISOString() },
      // /exit output
      { type: "user", message: { role: "user", content: "<local-command-stdout>Goodbye!</local-command-stdout>" }, uuid: "f5", timestamp: new Date(base + 2002).toISOString() },
    ];
    writeFileSync(tmpFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");

    const session = parseSession(tmpFile);
    const userEvents = session.events.filter(e => e.type === "user_prompt");
    // Should have: "Real prompt" and "/exit" — caveat and stdout skipped
    expect(userEvents.length).toBe(2);
    expect(userEvents[0].text).toBe("Real prompt");
    expect(userEvents[1].text).toBe("/exit");
    // No raw XML in any event
    const allTexts = session.events.map(e => e.text).join(" ");
    expect(allTexts).not.toContain("<local-command");
    expect(allTexts).not.toContain("<command-name");

    rmSync(tmpDir, { recursive: true });
  });
});
