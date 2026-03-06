import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from "fs";
import { join } from "path";
import { humanizeProjectPath, relativeTime, formatDuration } from "../util/format.js";

const CLAUDE_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".claude"
);
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

export interface SessionMeta {
  path: string;
  sessionId: string;
  slug: string;
  project: string;
  projectHuman: string;
  firstMessage: string;
  mtime: Date;
  size: number;
  durationEstimate: string;
  relativeTime: string;
}

function readFirstBytes(filepath: string, bytes: number): string {
  try {
    const fd = openSync(filepath, "r");
    const buf = Buffer.alloc(bytes);
    const bytesRead = readSync(fd, buf, 0, bytes, 0);
    closeSync(fd);
    return buf.toString("utf-8", 0, bytesRead);
  } catch {
    return "";
  }
}

function readLastBytes(filepath: string, bytes: number): string {
  try {
    const stat = statSync(filepath);
    const fd = openSync(filepath, "r");
    const offset = Math.max(0, stat.size - bytes);
    const buf = Buffer.alloc(Math.min(bytes, stat.size));
    const bytesRead = readSync(fd, buf, 0, buf.length, offset);
    closeSync(fd);
    return buf.toString("utf-8", 0, bytesRead);
  } catch {
    return "";
  }
}

function extractMetaFromChunk(chunk: string): { slug?: string; firstMessage?: string; timestamp?: string; model?: string } {
  const result: { slug?: string; firstMessage?: string; timestamp?: string; model?: string } = {};
  const lines = chunk.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!result.slug && entry.slug) result.slug = entry.slug;
      if (!result.timestamp && entry.timestamp) result.timestamp = entry.timestamp;
      if (!result.model && entry.message?.model) result.model = entry.message.model;
      if (!result.firstMessage && entry.type === "user" && !entry.isMeta && entry.message?.content) {
        const text = typeof entry.message.content === "string"
          ? entry.message.content
          : Array.isArray(entry.message.content)
            ? entry.message.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ")
            : "";
        const trimmed = text.trim();
        if (trimmed && !trimmed.startsWith("<command-name>") && !trimmed.startsWith("<local-command-") && !trimmed.startsWith("<task-notification>") && !trimmed.startsWith("This session is being continued")) {
          result.firstMessage = trimmed.split("\n")[0].slice(0, 80);
        }
      }
    } catch {
      continue;
    }
  }

  return result;
}

function estimateDuration(filepath: string, headChunk?: string): string {
  const first = headChunk ?? readFirstBytes(filepath, 4096);
  const last = readLastBytes(filepath, 4096);

  const firstMeta = extractMetaFromChunk(first);
  const lastMeta = extractMetaFromChunk(last);

  if (firstMeta.timestamp && lastMeta.timestamp) {
    const start = new Date(firstMeta.timestamp).getTime();
    const end = new Date(lastMeta.timestamp).getTime();
    if (start && end && end > start) {
      return formatDuration((end - start) / 1000);
    }
  }
  return "?";
}

export function scanSessions(): SessionMeta[] {
  const sessions: SessionMeta[] = [];

  let projects: string[];
  try {
    projects = readdirSync(PROJECTS_DIR);
  } catch {
    return [];
  }

  for (const project of projects) {
    const projectDir = join(PROJECTS_DIR, project);

    let files: string[];
    try {
      const stat = statSync(projectDir);
      if (!stat.isDirectory()) continue;
      files = readdirSync(projectDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      // Skip subagent directories
      if (file.includes("subagent")) continue;

      const filepath = join(projectDir, file);
      try {
        const stat = statSync(filepath);
        const sessionId = file.replace(/\.jsonl$/, "");

        // Fast metadata extraction
        const headChunk = readFirstBytes(filepath, 4096);
        const meta = extractMetaFromChunk(headChunk);

        sessions.push({
          path: filepath,
          sessionId,
          slug: meta.slug || sessionId.slice(0, 8),
          project,
          projectHuman: humanizeProjectPath(project),
          firstMessage: meta.firstMessage || "(empty session)",
          mtime: stat.mtime,
          size: stat.size,
          durationEstimate: estimateDuration(filepath, headChunk),
          relativeTime: relativeTime(stat.mtime),
        });
      } catch {
        continue;
      }
    }
  }

  // Sort by modification time, newest first
  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return sessions;
}

export function findSession(query: string): string | null {
  // Direct path
  if (query.endsWith(".jsonl")) {
    try {
      statSync(query);
      return query;
    } catch {
      return null;
    }
  }

  // Search by session ID prefix or slug
  const sessions = scanSessions();
  const match = sessions.find(
    s => s.sessionId.startsWith(query) || s.slug === query || s.sessionId.includes(query)
  );
  return match?.path || null;
}
