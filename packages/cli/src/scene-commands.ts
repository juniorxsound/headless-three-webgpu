import { basename, dirname, extname, join } from "node:path";

import { resolveSceneDuration, type SceneDocument } from "@rendergl/headless-three-webgpu-scene";
import { z } from "zod";

import { resolveVideoContainer, type VideoContainer } from "./commands.js";

const sceneRenderCommandOptionsSchema = z.object({
  output: z.string().min(1).optional(),
  view: z.string().min(1).optional(),
  sequence: z.string().min(1).optional(),
  time: z.coerce.number().finite().default(0),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  dawnFlag: z.array(z.string().min(1)).default([]),
});

const sceneVideoCommandOptionsSchema = z.object({
  output: z.string().min(1),
  view: z.string().min(1).optional(),
  sequence: z.string().min(1).optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  fps: z.coerce.number().int().positive().max(240).optional(),
  duration: z.coerce.number().finite().positive().max(600).optional(),
  crf: z.coerce.number().int().min(0).max(63).optional(),
  codec: z.string().min(1).optional(),
  loop: z.boolean().optional(),
  dawnFlag: z.array(z.string().min(1)).default([]),
});

export interface SceneRenderExecutionPlan {
  outputPath: string;
  viewId?: string;
  sequenceId?: string;
  time: number;
  width?: number;
  height?: number;
  dawnFlags?: string[];
}

export interface SceneVideoExecutionPlan {
  container: VideoContainer;
  outputPath: string;
  viewId?: string;
  sequenceId?: string;
  segments: SceneVideoSegmentPlan[];
  width?: number;
  height?: number;
  fps: number;
  durationSeconds: number;
  frames: number;
  crf?: number;
  codec?: string;
  loop?: boolean;
  dawnFlags?: string[];
}

export interface SceneVideoSegmentPlan {
  sequenceId?: string;
  durationSeconds: number;
  frames: number;
}

function resolveSceneOutputPath(
  scenePath: string,
  outputPath: string | undefined,
  extension: string,
): string {
  if (outputPath) {
    return outputPath;
  }

  const name = basename(scenePath, extname(scenePath));
  return join(dirname(scenePath), `${name}${extension}`);
}

function assertEncodableDimensions(
  width: number | undefined,
  height: number | undefined,
  container: VideoContainer,
): void {
  if (container === "gif" || width === undefined || height === undefined) {
    return;
  }

  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error(
      `${container} output uses yuv420p and requires even --width and --height (got ${width}x${height})`,
    );
  }
}

export function buildSceneRenderPlan(
  scenePath: string,
  options: unknown,
): SceneRenderExecutionPlan {
  const parsed = sceneRenderCommandOptionsSchema.parse(options);
  return {
    outputPath: resolveSceneOutputPath(scenePath, parsed.output, ".png"),
    time: parsed.time,
    ...(parsed.view ? { viewId: parsed.view } : {}),
    ...(parsed.sequence ? { sequenceId: parsed.sequence } : {}),
    ...(parsed.width !== undefined ? { width: parsed.width } : {}),
    ...(parsed.height !== undefined ? { height: parsed.height } : {}),
    ...(parsed.dawnFlag.length > 0 ? { dawnFlags: parsed.dawnFlag } : {}),
  };
}

export function buildSceneVideoPlan(
  scenePath: string,
  document: SceneDocument,
  options: unknown,
): SceneVideoExecutionPlan {
  const parsed = sceneVideoCommandOptionsSchema.parse(options);
  const container = resolveVideoContainer(parsed.output);
  const sequenceIds = parsed.sequence
    ? [parsed.sequence]
    : Object.values(document.sequences).map((sequence) => sequence.id);
  const firstTiming = resolveSceneDuration(document, sequenceIds[0]);
  const fps = parsed.fps ?? firstTiming.fps;
  const segments =
    sequenceIds.length > 0
      ? sequenceIds.map((sequenceId) => {
          const timing = resolveSceneDuration(document, sequenceId);
          const durationSeconds = parsed.duration ?? timing.durationSeconds;
          return {
            sequenceId,
            durationSeconds,
            frames: Math.max(1, Math.round(durationSeconds * fps)),
          };
        })
      : [
          {
            durationSeconds: parsed.duration ?? firstTiming.durationSeconds,
            frames: Math.max(1, Math.round((parsed.duration ?? firstTiming.durationSeconds) * fps)),
          },
        ];
  const durationSeconds = segments.reduce((total, segment) => total + segment.durationSeconds, 0);
  const frames = segments.reduce((total, segment) => total + segment.frames, 0);

  assertEncodableDimensions(parsed.width, parsed.height, container);

  return {
    container,
    outputPath: resolveSceneOutputPath(scenePath, parsed.output, ".mp4"),
    fps,
    durationSeconds,
    frames,
    segments,
    ...(parsed.view ? { viewId: parsed.view } : {}),
    ...(parsed.sequence ? { sequenceId: parsed.sequence } : {}),
    ...(parsed.width !== undefined ? { width: parsed.width } : {}),
    ...(parsed.height !== undefined ? { height: parsed.height } : {}),
    ...(parsed.crf !== undefined ? { crf: parsed.crf } : {}),
    ...(parsed.codec !== undefined ? { codec: parsed.codec } : {}),
    ...(parsed.loop !== undefined ? { loop: parsed.loop } : {}),
    ...(parsed.dawnFlag.length > 0 ? { dawnFlags: parsed.dawnFlag } : {}),
  };
}
