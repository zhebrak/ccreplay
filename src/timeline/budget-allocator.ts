import type { TimelineEntry, VideoConfig } from "./types.js";

// Priority for dropping events when over budget (lower = drop first)
const DROP_PRIORITY: Record<string, number> = {
  gap: 1,
  thinking: 2,
  summary: 3,
  tool_result: 3,
  tool_call: 4,
  compaction: 5,
  assistant_text: 7,
  user_prompt: 9,
};

export interface AllocatedEntry extends TimelineEntry {
  allocatedMs: number;
  startFrame: number;
  endFrame: number;
}

export function allocateBudgets(
  entries: TimelineEntry[],
  config: VideoConfig
): AllocatedEntry[] {
  if (entries.length === 0) return [];

  const lingerS = config.lingerDurationS || 0;
  const contentMs = (config.targetDurationS - config.introDurationS - config.outroDurationS - lingerS) * 1000;

  if (contentMs <= 0) {
    throw new Error(`Video duration (${config.targetDurationS}s) too short for intro/outro/linger (${config.introDurationS + config.outroDurationS + lingerS}s)`);
  }

  // Step 1: Compute boosted budgets
  let allocated = entries.map(e => ({
    ...e,
    allocatedMs: e.baseBudgetMs * e.boostMultiplier + e.paddingMs,
    startFrame: 0,
    endFrame: 0,
  }));

  // Step 2: Scale to fit
  let totalMs = allocated.reduce((sum, e) => sum + e.allocatedMs, 0);

  if (totalMs > contentMs) {
    // Scale everything down proportionally
    const scale = contentMs / totalMs;
    for (const e of allocated) {
      e.allocatedMs *= scale;
    }

    // Apply soft minimum floors (don't enforce if it would blow budget)
    const minFloor = 120; // absolute minimum per event: ~7 frames at 60fps
    for (const e of allocated) {
      e.allocatedMs = Math.max(e.allocatedMs, minFloor);
    }

    // Recheck total and drop low-priority events if over
    totalMs = allocated.reduce((sum, e) => sum + e.allocatedMs, 0);
    if (totalMs > contentMs) {
      // Sort all entries by priority (key moments get +10 boost)
      const sorted = [...allocated].sort((a, b) => {
        const pa = (DROP_PRIORITY[a.event.type] || 5) + (a.isKeyMoment ? 10 : 0)
          + (a.event.toolResult?.isError ? 3 : 0);
        const pb = (DROP_PRIORITY[b.event.type] || 5) + (b.isKeyMoment ? 10 : 0)
          + (b.event.toolResult?.isError ? 3 : 0);
        return pa - pb;
      });

      for (const d of sorted) {
        if (totalMs <= contentMs) break;
        totalMs -= d.allocatedMs;
        d.allocatedMs = 0;
      }
    }

    // Remove dropped entries
    allocated = allocated.filter(e => e.allocatedMs > 0);

    // Final proportional scale to exactly fill content budget
    totalMs = allocated.reduce((sum, e) => sum + e.allocatedMs, 0);
    if (totalMs > 0 && Math.abs(totalMs - contentMs) > 100) {
      const finalScale = contentMs / totalMs;
      for (const e of allocated) {
        e.allocatedMs *= finalScale;
      }
    }
  } else {
    // Under budget — scale up proportionally
    const scale = contentMs / totalMs;
    for (const e of allocated) {
      e.allocatedMs *= scale;
    }
  }

  // Step 3: Assign frame ranges
  const introFrames = Math.round(config.introDurationS * config.fps);
  const outroFrames = Math.round(config.outroDurationS * config.fps);
  const lingerFrames = Math.round((config.lingerDurationS || 0) * config.fps);
  const maxContentFrame = Math.round(config.targetDurationS * config.fps) - outroFrames - lingerFrames;
  let currentFrame = introFrames;

  for (const e of allocated) {
    if (currentFrame >= maxContentFrame) {
      e.allocatedMs = 0;
      continue;
    }
    let frames = Math.max(1, Math.round((e.allocatedMs / 1000) * config.fps));
    if (currentFrame + frames > maxContentFrame) {
      frames = maxContentFrame - currentFrame;
    }
    e.startFrame = currentFrame;
    e.endFrame = currentFrame + frames;
    currentFrame += frames;
  }

  return allocated.filter(e => e.allocatedMs > 0);
}

export function getAdaptiveDuration(sessionDurationS: number): number {
  if (sessionDurationS < 600) return 60;    // <10min -> 60s
  if (sessionDurationS < 1800) return 90;   // 10-30min -> 90s
  if (sessionDurationS < 3600) return 120;  // 30-60min -> 120s
  return 180;                                // >60min -> 180s
}
