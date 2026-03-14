import { describe, it, expect } from "vitest";
import { formatDuration, formatTokens, truncate, humanizeProjectPath, relativeTime, wordCount } from "../src/util/format.js";

describe("formatDuration", () => {
  it("seconds only", () => {
    expect(formatDuration(30)).toBe("30s");
  });

  it("rounds fractional seconds", () => {
    expect(formatDuration(30.7)).toBe("31s");
  });

  it("minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });

  it("exact minutes omits seconds", () => {
    expect(formatDuration(120)).toBe("2m");
  });

  it("hours and minutes", () => {
    expect(formatDuration(3661)).toBe("1h 1m");
  });

  it("zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("formatTokens", () => {
  it("small numbers unchanged", () => {
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("thousands with k suffix", () => {
    expect(formatTokens(1500)).toBe("2k");
    expect(formatTokens(10000)).toBe("10k");
  });

  it("millions with M suffix", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(2_000_000)).toBe("2.0M");
  });
});

describe("truncate", () => {
  it("short string unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("exact length unchanged", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("over length adds ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w\u2026");
  });

  it("empty string unchanged", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("humanizeProjectPath", () => {
  it("long path extracts last 3 segments", () => {
    expect(humanizeProjectPath("-home-alex-ddv-ml-cluster-simulator")).toBe("ml-cluster-simulator");
  });

  it("short path returns all remaining segments", () => {
    expect(humanizeProjectPath("-home-alex-myproject")).toBe("myproject");
  });

  it("no home prefix returns all parts", () => {
    expect(humanizeProjectPath("foo-bar")).toBe("foo-bar");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-03-14T12:00:00Z");

  it("just now", () => {
    expect(relativeTime(new Date("2026-03-14T11:59:30Z"), now)).toBe("just now");
  });

  it("minutes ago", () => {
    expect(relativeTime(new Date("2026-03-14T11:55:00Z"), now)).toBe("5m ago");
  });

  it("hours ago", () => {
    expect(relativeTime(new Date("2026-03-14T09:00:00Z"), now)).toBe("3h ago");
  });

  it("days ago", () => {
    expect(relativeTime(new Date("2026-03-12T12:00:00Z"), now)).toBe("2d ago");
  });

  it("1 day ago", () => {
    expect(relativeTime(new Date("2026-03-13T12:00:00Z"), now)).toBe("1d ago");
  });
});

describe("wordCount", () => {
  it("normal sentence", () => {
    expect(wordCount("hello world foo")).toBe(3);
  });

  it("extra whitespace", () => {
    expect(wordCount("  hello   world  ")).toBe(2);
  });

  it("empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  it("single word", () => {
    expect(wordCount("hello")).toBe(1);
  });
});
