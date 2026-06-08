import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
  createHeadlessWebGPURenderer,
  type HeadlessWebGPURendererDiagnostics,
} from "@rendergl/headless-three-webgpu";
import { type GltfFraming, prepareGltfScene } from "@rendergl/headless-three-webgpu-helpers";
import { PerspectiveCamera } from "three";

import type { VideoCameraPreset, VideoContainer, VideoExecutionPlan } from "./commands.js";
import { createFfmpegSink, type FrameSink } from "./encoder.js";
import { loadSceneModule } from "./render-js.js";

interface VideoRenderResult {
  outputPath: string;
  container: VideoContainer;
  frames: number;
  fps: number;
  durationSeconds: number;
  width: number;
  height: number;
  diagnostics: HeadlessWebGPURendererDiagnostics;
}

interface CameraMotion {
  preset: VideoCameraPreset;
  degrees: number;
  ease: boolean;
}

const CAMERA_START_ANGLE = Math.PI * 0.25;
const CAMERA_ELEVATION_FACTOR = 0.6;
const DOLLY_NEAR_FACTOR = 0.45;
const DOLLY_FAR_FACTOR = 1.3;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Normalized progress (0..1) for a frame. Turntable loops seamlessly (the last
 * frame stops one step before the start), while dollies travel the full path
 * from the first frame to the last.
 */
export function frameProgress(
  preset: VideoCameraPreset,
  frameIndex: number,
  frameCount: number,
): number {
  if (frameCount <= 1) {
    return 0;
  }
  return preset === "turntable" ? frameIndex / frameCount : frameIndex / (frameCount - 1);
}

function orbitDistanceForPreset(
  preset: VideoCameraPreset,
  framing: GltfFraming,
  t: number,
): number {
  if (preset === "turntable") {
    return framing.distance;
  }

  const near = framing.distance * DOLLY_NEAR_FACTOR;
  const far = framing.distance * DOLLY_FAR_FACTOR;
  const from = preset === "dolly-in" ? far : near;
  const to = preset === "dolly-in" ? near : far;
  return from + (to - from) * t;
}

function orbitAngleForPreset(preset: VideoCameraPreset, t: number, degrees: number): number {
  const sweep = preset === "turntable" ? t * ((degrees * Math.PI) / 180) : 0;
  return CAMERA_START_ANGLE + sweep;
}

function positionCamera(
  camera: PerspectiveCamera,
  framing: GltfFraming,
  motion: CameraMotion,
  progress: number,
): void {
  const t = motion.ease ? easeInOut(progress) : progress;
  const [centerX, centerY, centerZ] = framing.center;
  const distance = orbitDistanceForPreset(motion.preset, framing, t);
  const angle = orbitAngleForPreset(motion.preset, t, motion.degrees);

  camera.position.set(
    centerX + Math.sin(angle) * distance,
    centerY + framing.radius * CAMERA_ELEVATION_FACTOR,
    centerZ + Math.cos(angle) * distance,
  );
  camera.lookAt(centerX, centerY, centerZ);
}

type FrameRenderer = (frameIndex: number) => Promise<Uint8Array>;

async function streamFrames(
  frameCount: number,
  sink: FrameSink,
  renderFrame: FrameRenderer,
): Promise<void> {
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    await sink.writeFrame(await renderFrame(frameIndex));
  }
}

async function renderGltfVideo(
  plan: Extract<VideoExecutionPlan, { kind: "gltf" }>,
  sink: FrameSink,
): Promise<HeadlessWebGPURendererDiagnostics> {
  const prepared = await prepareGltfScene(plan.render);
  const motion: CameraMotion = { preset: plan.camera, degrees: plan.degrees, ease: plan.ease };

  try {
    const { framing, renderer, scene } = prepared;
    const camera = new PerspectiveCamera(framing.fov, framing.aspect, framing.near, framing.far);

    await streamFrames(plan.frames, sink, async (frameIndex) => {
      positionCamera(
        camera,
        framing,
        motion,
        frameProgress(motion.preset, frameIndex, plan.frames),
      );
      await renderer.render(scene, camera);
      return renderer.readPixels();
    });

    return renderer.getDiagnostics();
  } finally {
    await prepared.dispose();
  }
}

async function renderJsVideo(
  plan: Extract<VideoExecutionPlan, { kind: "js" }>,
  sink: FrameSink,
): Promise<HeadlessWebGPURendererDiagnostics> {
  const { scene, camera, update } = await loadSceneModule(plan.modulePath, {
    width: plan.width,
    height: plan.height,
  });
  const renderer = await createHeadlessWebGPURenderer({
    width: plan.width,
    height: plan.height,
    ...(plan.dawnFlags && plan.dawnFlags.length > 0 ? { dawnFlags: plan.dawnFlags } : {}),
  });
  const secondsPerFrame = 1 / plan.fps;

  try {
    await streamFrames(plan.frames, sink, async (frameIndex) => {
      await update?.(frameIndex === 0 ? 0 : secondsPerFrame);
      await renderer.render(scene, camera);
      return renderer.readPixels();
    });

    return renderer.getDiagnostics();
  } finally {
    await renderer.dispose();
  }
}

function createSinkForPlan(plan: VideoExecutionPlan): FrameSink {
  return createFfmpegSink({
    outputPath: plan.outputPath,
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
    container: plan.container,
    ...(plan.crf !== undefined ? { crf: plan.crf } : {}),
    ...(plan.codec !== undefined ? { codec: plan.codec } : {}),
    ...(plan.loop !== undefined ? { loop: plan.loop } : {}),
  });
}

export async function runVideo(plan: VideoExecutionPlan): Promise<VideoRenderResult> {
  await mkdir(dirname(plan.outputPath), { recursive: true });

  const sink = createSinkForPlan(plan);

  let diagnostics: HeadlessWebGPURendererDiagnostics;
  try {
    diagnostics =
      plan.kind === "gltf" ? await renderGltfVideo(plan, sink) : await renderJsVideo(plan, sink);
    await sink.finalize();
  } catch (error) {
    sink.abort();
    throw error;
  }

  return {
    outputPath: plan.outputPath,
    container: plan.container,
    frames: plan.frames,
    fps: plan.fps,
    durationSeconds: plan.durationSeconds,
    width: plan.width,
    height: plan.height,
    diagnostics,
  };
}
