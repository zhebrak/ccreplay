import type { SessionEvent, ToolCallInfo, ToolResultInfo } from "../parser/parse-session.js";

export interface TimelineEntry {
  event: SessionEvent;
  eventIndex: number;
  baseBudgetMs: number;
  boostMultiplier: number;
  isKeyMoment: boolean;
  paddingMs: number;
  cumulativeTokens: number;
  cumulativeFiles: number;
  cumulativeToolCalls: number;
}

export interface TimelineFrame {
  entryIndex: number;
  entry: TimelineEntry;
  startFrame: number;
  endFrame: number;
  /** 0..1 progress within this entry's duration */
  progress: number;
  /** 0..1 overall video progress */
  globalProgress: number;
}

export interface VideoConfig {
  targetDurationS: number;
  fps: number;
  width: number;
  height: number;
  introDurationS: number;
  outroDurationS: number;
  lingerDurationS: number;
}
