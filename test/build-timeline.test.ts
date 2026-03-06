import { describe, it, expect } from "vitest";
import { join } from "path";
import { parseSession } from "../src/parser/parse-session.js";
import { extractMoments } from "../src/parser/extract-moments.js";
import { buildTimeline } from "../src/timeline/build-timeline.js";
import { allocateBudgets, getAdaptiveDuration } from "../src/timeline/budget-allocator.js";

const FIXTURE = join(__dirname, "fixtures", "minimal-session.jsonl");

describe("buildTimeline", () => {
  it("builds timeline entries from events", () => {
    const session = parseSession(FIXTURE);
    const moments = extractMoments(session.events);
    const timeline = buildTimeline(session.events, moments);
    expect(timeline.length).toBeGreaterThan(0);
  });

  it("tracks cumulative counters", () => {
    const session = parseSession(FIXTURE);
    const moments = extractMoments(session.events);
    const timeline = buildTimeline(session.events, moments);
    const last = timeline[timeline.length - 1];
    expect(last.cumulativeToolCalls).toBeGreaterThan(0);
  });

  it("marks key moments", () => {
    const session = parseSession(FIXTURE);
    const moments = extractMoments(session.events);
    const timeline = buildTimeline(session.events, moments);
    const keyEntries = timeline.filter(e => e.isKeyMoment);
    expect(keyEntries.length).toBeGreaterThan(0);
  });
});

describe("allocateBudgets", () => {
  it("fits within target duration", () => {
    const session = parseSession(FIXTURE);
    const moments = extractMoments(session.events);
    const timeline = buildTimeline(session.events, moments);
    const durationS = 20;
    const fps = 30;

    const allocated = allocateBudgets(timeline, {
      targetDurationS: durationS,
      fps,
      width: 1920,
      height: 1080,
      introDurationS: 1.5,
      outroDurationS: 2,
      lingerDurationS: 0,
    });

    expect(allocated.length).toBeGreaterThan(0);
    const maxFrame = durationS * fps;
    for (const e of allocated) {
      expect(e.endFrame).toBeLessThanOrEqual(maxFrame);
    }
  });
});

describe("getAdaptiveDuration", () => {
  it("returns appropriate durations", () => {
    expect(getAdaptiveDuration(120)).toBe(60);   // 2min session
    expect(getAdaptiveDuration(900)).toBe(90);   // 15min session
    expect(getAdaptiveDuration(2400)).toBe(120);  // 40min session
    expect(getAdaptiveDuration(7200)).toBe(180);  // 2h session
  });
});
