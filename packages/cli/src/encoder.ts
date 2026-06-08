import { spawn } from "node:child_process";
import { once } from "node:events";

import type { VideoContainer } from "./commands.js";

export interface FrameSink {
  writeFrame: (frame: Uint8Array) => Promise<void>;
  finalize: () => Promise<void>;
  abort: () => void;
}

export interface FfmpegSinkOptions {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  container: VideoContainer;
  crf?: number;
  codec?: string;
  loop?: boolean;
}

const FFMPEG_BINARY = process.env.RGL_FFMPEG_PATH ?? "ffmpeg";

/**
 * Probe for a usable ffmpeg binary before doing any (expensive) rendering work.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(FFMPEG_BINARY, ["-version"], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

export function ffmpegInstallHint(): string {
  return [
    "Video output requires ffmpeg, but it was not found on your PATH.",
    "Install it, then re-run:",
    "  macOS:          brew install ffmpeg",
    "  Debian/Ubuntu:  sudo apt-get install ffmpeg",
    "  Windows:        winget install ffmpeg",
    "Downloads and docs: https://ffmpeg.org/download.html",
    "If ffmpeg lives elsewhere, set RGL_FFMPEG_PATH to its absolute path.",
  ].join("\n");
}

export function buildFfmpegArgs(options: FfmpegSinkOptions): string[] {
  const input = [
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${options.width}x${options.height}`,
    "-r",
    String(options.fps),
    "-i",
    "-",
  ];

  const output: string[] = [];
  if (options.container === "gif") {
    // Single-pass palette generation keeps quality reasonable without a temp file.
    output.push(
      "-vf",
      "split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a",
    );
    output.push("-loop", options.loop === false ? "-1" : "0");
  } else if (options.container === "webm") {
    output.push(
      "-c:v",
      options.codec ?? "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      "0",
      "-crf",
      String(options.crf ?? 32),
    );
  } else {
    output.push(
      "-c:v",
      options.codec ?? "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      String(options.crf ?? 18),
      "-movflags",
      "+faststart",
    );
  }

  return ["-y", "-hide_banner", "-loglevel", "error", ...input, ...output, options.outputPath];
}

/**
 * Spawn ffmpeg and stream raw RGBA frames to its stdin. Frames must be exactly
 * `width * height * 4` bytes in top-to-bottom row order.
 */
export function createFfmpegSink(options: FfmpegSinkOptions): FrameSink {
  const child = spawn(FFMPEG_BINARY, buildFfmpegArgs(options), {
    stdio: ["pipe", "inherit", "inherit"],
  });

  let failure: Error | null = null;
  let exited: Promise<number> | null = null;

  const recordFailure = (error: Error): void => {
    failure ??= error;
  };

  child.on("error", recordFailure);
  // ffmpeg exiting early turns the next write into an EPIPE; capture it here so
  // the unhandled "error" event cannot crash the host process.
  child.stdin?.on("error", recordFailure);

  const waitForExit = (): Promise<number> => {
    exited ??= once(child, "close").then(([code]) => (code as number | null) ?? 0);
    return exited;
  };

  return {
    async writeFrame(frame: Uint8Array) {
      if (failure) {
        throw failure;
      }

      const { stdin } = child;
      if (!stdin || stdin.destroyed) {
        throw new Error(`ffmpeg closed its input early (exit code ${await waitForExit()})`);
      }

      if (!stdin.write(frame)) {
        await once(stdin, "drain");
      }
    },
    async finalize() {
      if (failure) {
        throw failure;
      }

      child.stdin?.end();
      const code = await waitForExit();
      if (code !== 0) {
        throw new Error(`ffmpeg exited with code ${code}`);
      }
    },
    abort() {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    },
  };
}
