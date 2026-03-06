import { describe, it, expect } from "vitest";
import { mergeStreamingEntries, type RawEntry } from "../src/parser/merge-stream.js";

function makeEntry(overrides: Partial<RawEntry> & { uuid: string; timestamp: string; type: string }): RawEntry {
  return {
    ...overrides,
  } as RawEntry;
}

describe("mergeStreamingEntries", () => {
  it("merges assistant entries with same message.id", () => {
    const entries: RawEntry[] = [
      makeEntry({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00Z",
        message: {
          id: "msg_1",
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "Hello" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
      makeEntry({
        type: "assistant",
        uuid: "a2",
        timestamp: "2026-01-01T00:00:01Z",
        message: {
          id: "msg_1",
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "foo.ts" } }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      }),
    ];

    const merged = mergeStreamingEntries(entries);
    expect(merged.length).toBe(1);
    const content = merged[0].message!.content as any[];
    expect(content.length).toBe(2);
    expect(content[0].type).toBe("text");
    expect(content[1].type).toBe("tool_use");
  });

  it("skips progress and file-history-snapshot entries", () => {
    const entries: RawEntry[] = [
      makeEntry({ type: "progress", uuid: "p1", timestamp: "2026-01-01T00:00:00Z" }),
      makeEntry({ type: "file-history-snapshot", uuid: "f1", timestamp: "2026-01-01T00:00:00Z" }),
      makeEntry({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:01Z",
        message: { role: "user", content: "Hello" },
      }),
    ];

    const merged = mergeStreamingEntries(entries);
    expect(merged.length).toBe(1);
    expect(merged[0].type).toBe("user");
  });

  it("preserves non-assistant entries in order", () => {
    const entries: RawEntry[] = [
      makeEntry({
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        message: { role: "user", content: "Hi" },
      }),
      makeEntry({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:00:01Z",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
        },
      }),
      makeEntry({
        type: "user",
        uuid: "u2",
        timestamp: "2026-01-01T00:00:02Z",
        message: { role: "user", content: "Thanks" },
      }),
    ];

    const merged = mergeStreamingEntries(entries);
    expect(merged.length).toBe(3);
    expect(merged[0].type).toBe("user");
    expect(merged[1].type).toBe("assistant");
    expect(merged[2].type).toBe("user");
  });
});
