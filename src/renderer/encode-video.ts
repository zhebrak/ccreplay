import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findFfmpeg(): string | null {
  // 1. System PATH (user's own build takes priority)
  try {
    const cmd = process.platform === "win32" ? "where ffmpeg" : "command -v ffmpeg";
    const result = execSync(cmd, { stdio: "pipe" }).toString().trim().split(/\r?\n/)[0].trim();
    if (result) return result;
  } catch {}

  // 2. Local bundled binary (legacy / development)
  const local = join(__dirname, "..", "..", "ffmpeg");
  if (existsSync(local)) return local;

  // 3. ffmpeg-static npm package (lazy-loaded)
  try {
    const require = createRequire(import.meta.url);
    const ffmpegStatic: string | null = require("ffmpeg-static");
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {}

  return null;
}

let ffmpegPath: string | null = null;

export function checkFfmpeg(): boolean {
  ffmpegPath = findFfmpeg();
  return ffmpegPath !== null;
}

export function printFfmpegInstallInstructions(): void {
  const platform = process.platform;
  console.error("\n  ffmpeg is required but was not found.\n");
  console.error("  This is unexpected — ffmpeg should be bundled with ccreplay.");
  console.error("  Try reinstalling: npm install -g @zhebrak/ccreplay\n");
  console.error("  Or install ffmpeg manually:");
  if (platform === "darwin") {
    console.error("    brew install ffmpeg");
  } else if (platform === "linux") {
    console.error("    sudo apt install ffmpeg");
  } else if (platform === "win32") {
    console.error("    winget install ffmpeg");
  } else {
    console.error("    https://ffmpeg.org/download.html");
  }
  console.error("");
}

export interface EncodeOptions {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  crf?: number;
  preset?: string;
}

export function createEncoder(opts: EncodeOptions): {
  writeFrame: (rgbaBuffer: Buffer) => Promise<void>;
  finish: () => Promise<void>;
} {
  const bin = ffmpegPath || "ffmpeg";
  const proc = spawn(bin, [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${opts.width}x${opts.height}`,
    "-r", String(opts.fps),
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", String(opts.crf ?? 23),
    "-preset", opts.preset ?? "ultrafast",
    "-movflags", "+faststart",
    opts.outputPath,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let error: Error | null = null;

  const stderrChunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => { stderrChunks.push(chunk); });
  proc.on("error", (err) => { error = err; });

  const stdin = proc.stdin;
  if (!stdin) throw new Error("ffmpeg stdin not available");

  const writeFrame = (rgbaBuffer: Buffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (error) return reject(error);
      const ok = stdin.write(rgbaBuffer);
      if (ok) {
        resolve();
      } else {
        stdin.once("drain", resolve);
      }
    });
  };

  const finish = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderrChunks).toString().slice(-500)}`));
      });
      stdin.end();
    });
  };

  return { writeFrame, finish };
}
