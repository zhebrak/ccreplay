export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

export function humanizeProjectPath(encoded: string): string {
  // "-home-alex-ddv-ml-cluster-simulator" -> "ml-cluster-simulator"
  const parts = encoded.replace(/^-/, "").split("-");
  // Skip home, username, and short path segments to find project name
  // Heuristic: skip leading parts that look like path segments (home, user, short dirs)
  let start = 0;
  if (parts[0] === "home") start = 2; // skip "home" and username
  // Find the last meaningful segment(s)
  const remaining = parts.slice(start);
  if (remaining.length <= 3) return remaining.join("-");
  // Take last 3 parts as project name
  return remaining.slice(-3).join("-");
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1d ago";
  return `${diffD}d ago`;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
