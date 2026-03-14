import { describe, it, expect } from "vitest";
import { join } from "path";
import { parseSession } from "../src/parser/parse-session.js";
import { extractMoments } from "../src/parser/extract-moments.js";
import { buildTimeline } from "../src/timeline/build-timeline.js";
import { allocateBudgets } from "../src/timeline/budget-allocator.js";
import { FrameRenderer } from "../src/renderer/frame-renderer.js";
import { COLORS, LAYOUT, GEOMETRY, TOOL_ACCENT, initTheme } from "../src/renderer/theme.js";
import { initFonts } from "../src/renderer/fonts.js";
import { resolveConfig } from "../src/config/resolve.js";
import type { CcreplayConfig } from "../src/config/schema.js";
import { getPixel, colorClose } from "./helpers.js";

const FIXTURE = join(__dirname, "fixtures", "minimal-session.jsonl");

function buildTestSession(configOverrides?: Partial<CcreplayConfig>) {
  const config = resolveConfig(configOverrides ?? {});
  initTheme(config);
  initFonts(config);
  const session = parseSession(FIXTURE);
  const moments = extractMoments(session.events);
  const timeline = buildTimeline(session.events, moments);
  const allocated = allocateBudgets(timeline, {
    targetDurationS: 10, fps: config.video.fps,
    width: config.video.width, height: config.video.height,
    introDurationS: 1, outroDurationS: 1, lingerDurationS: 0,
  });
  return { session, allocated, config };
}

describe("default config renders correctly", () => {
  it("renders intro frame with gradient colors", () => {
    const { session, allocated, config } = buildTestSession();
    const totalFrames = Math.round(10 * config.video.fps);
    const introFrames = Math.round(1 * config.video.fps);
    const outroFrames = Math.round(1 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, outroFrames, 0);
    const buf = renderer.renderFrame(0);

    // Sample center pixel - should be dark gradient
    const cx = Math.floor(config.video.width / 2);
    const cy = Math.floor(config.video.height / 2);
    const pixel = getPixel(buf, config.video.width, cx, cy);
    // Gradient is dark (RGB values all < 100)
    expect(pixel[0]).toBeLessThan(100);
    expect(pixel[1]).toBeLessThan(100);
    expect(pixel[2]).toBeLessThan(100);
    expect(pixel[3]).toBe(255); // fully opaque
  });

  it("renders content frame with correct background", () => {
    const { session, allocated, config } = buildTestSession();
    const totalFrames = Math.round(10 * config.video.fps);
    const introFrames = Math.round(1 * config.video.fps);
    const outroFrames = Math.round(1 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, outroFrames, 0);
    // Frame past intro
    const buf = renderer.renderFrame(introFrames + 10);

    // Pixel inside terminal body should be close to background
    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [18, 18, 24])).toBe(true);
  });

  it("canvas dimensions = 1920x1080", () => {
    const { session, allocated, config } = buildTestSession();
    const totalFrames = Math.round(10 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, 60, 60, 0);
    const buf = renderer.renderFrame(0);
    expect(buf.length).toBe(1920 * 1080 * 4);
  });
});

describe("theme changes background color", () => {
  it("dracula has correct background", () => {
    const { session, allocated, config } = buildTestSession({ theme: "dracula" });
    const totalFrames = Math.round(10 * config.video.fps);
    const introFrames = Math.round(1 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);
    const buf = renderer.renderFrame(introFrames + 10);

    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [40, 42, 54])).toBe(true);
  });

  it("light theme has light background", () => {
    const { session, allocated, config } = buildTestSession({ theme: "light" });
    const totalFrames = Math.round(10 * config.video.fps);
    const introFrames = Math.round(1 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);
    const buf = renderer.renderFrame(introFrames + 10);

    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [250, 250, 250])).toBe(true);
  });

  it("monokai has correct background", () => {
    const { session, allocated, config } = buildTestSession({ theme: "monokai" });
    const totalFrames = Math.round(10 * config.video.fps);
    const introFrames = Math.round(1 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);
    const buf = renderer.renderFrame(introFrames + 10);

    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    expect(colorClose(pixel, [39, 40, 34])).toBe(true);
  });
});

describe("resolution changes canvas dimensions", () => {
  it("720p produces correct buffer size", () => {
    const { session, allocated, config } = buildTestSession({ video: { width: 1280, height: 720 } });
    const totalFrames = Math.round(10 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, 60, 60, 0);
    const buf = renderer.renderFrame(0);
    expect(buf.length).toBe(1280 * 720 * 4);

    // Corner pixel should be gradient color (not black/uninitialized)
    const pixel = getPixel(buf, 1280, 1, 1);
    expect(pixel[3]).toBe(255); // opaque
  });

  it("4k produces correct buffer size", () => {
    const { session, allocated, config } = buildTestSession({ video: { width: 3840, height: 2160 } });
    const totalFrames = Math.round(10 * config.video.fps);
    const renderer = new FrameRenderer(session, allocated, totalFrames, 60, 60, 0);
    const buf = renderer.renderFrame(0);
    expect(buf.length).toBe(3840 * 2160 * 4);
  });
});

describe("font size affects layout", () => {
  it("default font size charWidth is approximately 10.8", () => {
    buildTestSession();
    expect(LAYOUT.charWidth).toBeCloseTo(10.8, 0);
  });

  it("larger font size increases charWidth", () => {
    buildTestSession({ font: { size: 24 } });
    expect(LAYOUT.charWidth).toBeGreaterThan(10.8);
  });

  it("larger font size decreases maxCharsPerLine", () => {
    buildTestSession();
    const defaultMaxChars = LAYOUT.maxCharsPerLine;

    buildTestSession({ font: { size: 24 } });
    expect(LAYOUT.maxCharsPerLine).toBeLessThan(defaultMaxChars);
  });
});

describe("custom accent color propagates", () => {
  it("sets COLORS.claude to custom accent", () => {
    buildTestSession({ colors: { accent: "#ff0000" } });
    expect(COLORS.claude).toBe("rgb(255, 0, 0)");
  });

  it("sets TOOL_ACCENT to custom accent", () => {
    buildTestSession({ colors: { accent: "#ff0000" } });
    expect(TOOL_ACCENT.Read).toBe("rgb(255, 0, 0)");
    expect(TOOL_ACCENT.Edit).toBe("rgb(255, 0, 0)");
  });

  it("sets progressFill to custom accent", () => {
    buildTestSession({ colors: { accent: "#ff0000" } });
    expect(COLORS.progressFill).toBe("rgb(255, 0, 0)");
  });
});

describe("linger fade uses theme background", () => {
  it("default theme linger fades toward dark background", () => {
    const { session, allocated, config } = buildTestSession();
    const totalFrames = 600;
    const introFrames = 60;
    const outroFrames = 60;
    const lingerFrames = 60;
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, outroFrames, lingerFrames);

    // Render deep into linger
    const lingerStart = totalFrames - outroFrames - lingerFrames;
    const buf = renderer.renderFrame(lingerStart + lingerFrames - 2);

    // Gradient area pixel should be very dark (faded toward #121218)
    const pixel = getPixel(buf, config.video.width, 5, 5);
    expect(pixel[0]).toBeLessThan(30);
    expect(pixel[1]).toBeLessThan(30);
    expect(pixel[2]).toBeLessThan(40);
  });

  it("light theme linger does NOT fade to black", () => {
    const { session, allocated, config } = buildTestSession({ theme: "light" });
    const totalFrames = 600;
    const introFrames = 60;
    const outroFrames = 60;
    const lingerFrames = 60;
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, outroFrames, lingerFrames);

    const lingerStart = totalFrames - outroFrames - lingerFrames;
    const buf = renderer.renderFrame(lingerStart + lingerFrames - 2);

    // Terminal body area pixel should still be light (not black)
    const px = GEOMETRY.termX + LAYOUT.innerPadding + 5;
    const py = GEOMETRY.bodyTop + 5;
    const pixel = getPixel(buf, config.video.width, px, py);
    // Should be lighter than if it faded to black — at least > 150
    expect(pixel[0]).toBeGreaterThan(150);
    expect(pixel[1]).toBeGreaterThan(150);
    expect(pixel[2]).toBeGreaterThan(150);
  });
});

describe("window controls toggle", () => {
  it("renders traffic lights by default", () => {
    const { session, allocated, config } = buildTestSession();
    const totalFrames = 600;
    const introFrames = 60;
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);
    const buf = renderer.renderFrame(introFrames + 5);

    // Red traffic light dot position
    const dotY = GEOMETRY.termY + Math.floor(LAYOUT.titleBarHeight / 2);
    const dotX = GEOMETRY.termX + Math.floor(LAYOUT.trafficDotsLeftMargin + LAYOUT.trafficDotRadius);
    const pixel = getPixel(buf, config.video.width, dotX, dotY);
    // Should have red component > 200
    expect(pixel[0]).toBeGreaterThan(200);
  });

  it("hides traffic lights when controls=false", () => {
    const { session, allocated, config } = buildTestSession({ window: { controls: false } });
    const totalFrames = 600;
    const introFrames = 60;
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);
    const buf = renderer.renderFrame(introFrames + 5);

    // Same position - should be title bar background color, not red
    const dotY = GEOMETRY.termY + Math.floor(LAYOUT.titleBarHeight / 2);
    const dotX = GEOMETRY.termX + Math.floor(LAYOUT.trafficDotsLeftMargin + LAYOUT.trafficDotRadius);
    const pixel = getPixel(buf, config.video.width, dotX, dotY);
    // Red dot pixel should NOT be bright red - should be titleBarBg (dark)
    expect(pixel[0]).toBeLessThan(100);
  });
});

describe("geometry propagation (destructuring fix)", () => {
  it("720p terminal fits within canvas", () => {
    const { session, allocated, config } = buildTestSession({ video: { width: 1280, height: 720 } });
    const totalFrames = 600;
    const introFrames = 60;
    const renderer = new FrameRenderer(session, allocated, totalFrames, introFrames, 60, 0);

    // Should not throw
    const buf = renderer.renderFrame(introFrames + 10);
    expect(buf.length).toBe(1280 * 720 * 4);

    // Content at body origin is background color (not gradient/shadow)
    const pixel = getPixel(buf, 1280, GEOMETRY.bodyLeft, GEOMETRY.bodyTop);
    // Should be background color (whatever it is), verified by being in-bounds
    expect(pixel[3]).toBe(255);
  });

  it("custom outerPadding changes geometry", () => {
    buildTestSession({ window: { outerPadding: 80 } });
    expect(GEOMETRY.termW).toBe(1920 - 80 * 2);
    expect(GEOMETRY.termX).toBe(80);
  });
});
