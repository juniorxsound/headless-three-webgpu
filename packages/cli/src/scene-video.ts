import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { prepareSceneRender, type SceneDocument } from "@rendergl/headless-three-webgpu-scene";
import type { HeadlessWebGPURendererDiagnostics } from "@rendergl/headless-three-webgpu";

import { createFfmpegSink } from "./encoder.js";
import type { SceneVideoExecutionPlan } from "./scene-commands.js";

interface SceneVideoRenderOptions {
  scenePath: string;
  document: SceneDocument;
  plan: SceneVideoExecutionPlan;
}

interface SceneVideoRenderResult {
  outputPath: string;
  container: SceneVideoExecutionPlan["container"];
  segments: SceneVideoExecutionPlan["segments"];
  frames: number;
  fps: number;
  durationSeconds: number;
  width: number;
  height: number;
  diagnostics: HeadlessWebGPURendererDiagnostics;
  viewId: string;
}

export async function runSceneVideo(
  options: SceneVideoRenderOptions,
): Promise<SceneVideoRenderResult> {
  const prepared = await prepareSceneRender({
    document: options.document,
    scenePath: options.scenePath,
    ...(options.plan.viewId ? { viewId: options.plan.viewId } : {}),
    ...(options.plan.sequenceId ? { sequenceId: options.plan.sequenceId } : {}),
    ...(options.plan.width !== undefined ? { width: options.plan.width } : {}),
    ...(options.plan.height !== undefined ? { height: options.plan.height } : {}),
    ...(options.plan.dawnFlags ? { dawnFlags: options.plan.dawnFlags } : {}),
  });

  await mkdir(dirname(options.plan.outputPath), { recursive: true });
  const sink = createFfmpegSink({
    outputPath: options.plan.outputPath,
    width: prepared.output.width,
    height: prepared.output.height,
    fps: options.plan.fps,
    container: options.plan.container,
    ...(options.plan.crf !== undefined ? { crf: options.plan.crf } : {}),
    ...(options.plan.codec !== undefined ? { codec: options.plan.codec } : {}),
    ...(options.plan.loop !== undefined ? { loop: options.plan.loop } : {}),
  });

  try {
    for (const segment of options.plan.segments) {
      for (let frameIndex = 0; frameIndex < segment.frames; frameIndex += 1) {
        const progress = segment.frames <= 1 ? 0 : frameIndex / Math.max(segment.frames - 1, 1);
        const time = progress * segment.durationSeconds;
        prepared.applyAt(time, segment.sequenceId);
        await prepared.renderer.render(prepared.scene, prepared.getCamera());
        await sink.writeFrame(await prepared.renderer.readPixels());
      }
    }

    await sink.finalize();

    return {
      outputPath: options.plan.outputPath,
      container: options.plan.container,
      segments: options.plan.segments,
      frames: options.plan.frames,
      fps: options.plan.fps,
      durationSeconds: options.plan.durationSeconds,
      width: prepared.output.width,
      height: prepared.output.height,
      diagnostics: prepared.renderer.getDiagnostics(),
      viewId: prepared.viewId,
    };
  } catch (error) {
    sink.abort();
    throw error;
  } finally {
    await prepared.dispose();
  }
}
