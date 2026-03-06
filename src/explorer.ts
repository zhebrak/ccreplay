import { scanSessions, type SessionMeta } from "./parser/session-finder.js";
import { truncate } from "./util/format.js";

export async function pickSession(): Promise<string | null> {
  const sessions = scanSessions();
  if (sessions.length === 0) {
    console.error("  No Claude Code sessions found.");
    return null;
  }

  // Check if we're in a TTY
  if (!process.stdin.isTTY) {
    return pickSessionPlainText(sessions);
  }

  try {
    const { default: select } = await import("@inquirer/select");

    const choice = await select({
      message: "ccreplay \u2014 pick a session",
      choices: sessions.slice(0, 20).map((s) => ({
        name: formatSessionLine(s),
        value: s.path,
        description: truncate(s.firstMessage, 70),
      })),
      pageSize: 15,
    });

    return choice;
  } catch (e: any) {
    if (e.name === "ExitPromptError") {
      return null;
    }
    // Fallback to plain text
    return pickSessionPlainText(sessions);
  }
}

function pickSessionPlainText(sessions: SessionMeta[]): string | null {
  console.log("\n  Recent sessions:\n");
  const top = sessions.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const s = top[i];
    console.log(`  ${String(i + 1).padStart(2)}.  ${s.relativeTime.padEnd(8)}  ${s.projectHuman.padEnd(20)}  ${s.slug.padEnd(26)}  "${truncate(s.firstMessage, 40)}"  ${s.durationEstimate}`);
  }
  console.log(`\n  Run: ccreplay <session-id>\n`);
  return null;
}

function formatSessionLine(s: SessionMeta): string {
  return `${s.relativeTime.padEnd(8)}  ${s.projectHuman.padEnd(18)}  ${s.slug.padEnd(26)}  ${s.durationEstimate}`;
}
