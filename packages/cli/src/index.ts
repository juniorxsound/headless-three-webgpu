#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { Command } from "commander";
import { encodeImageToBuffer, runRendererBenchmark } from "@rendergl/headless-three-webgpu";
import { inspectGltfAsset, renderGltf } from "@rendergl/headless-three-webgpu-helpers";
import {
  loadSceneDocumentFile,
  renderSceneDocumentPasses,
} from "@rendergl/headless-three-webgpu-scene";

import { buildBenchOptions, buildRenderPlan, buildVideoPlan } from "./commands.js";
import { ffmpegInstallHint, isFfmpegAvailable } from "./encoder.js";
import { renderSceneModule } from "./render-js.js";
import { buildSceneRenderPlan, buildSceneVideoPlan } from "./scene-commands.js";
import { runSceneVideo } from "./scene-video.js";
import { runVideo } from "./video.js";

const program = new Command();

program.name("rgl").description("@rendergl/headless-three-webgpu CLI").version("0.1.0");

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function resolveScenePassOutputPath(outputPath: string, passId: string, format: string): string {
  const extension = extname(outputPath);
  const baseName = basename(outputPath, extension || undefined);
  const directory = dirname(outputPath);
  const finalExtension = extension || `.${format}`;
  return join(
    directory,
    passId === "color" ? `${baseName}${finalExtension}` : `${baseName}.${passId}${finalExtension}`,
  );
}

function removeDefaultedSceneVideoOptions(
  options: Record<string, unknown>,
  command: Command,
): Record<string, unknown> {
  const normalized = { ...options };

  if (command.getOptionValueSource("fps") === "default") {
    delete normalized.fps;
  }
  if (command.getOptionValueSource("duration") === "default") {
    delete normalized.duration;
  }

  return normalized;
}

/**
 * Options shared by `render` and `video`: scene sizing, lighting, and the
 * environment map. Each command layers its own output and camera options on top.
 */
function addSharedSceneOptions(command: Command): Command {
  return command
    .option("--width <number>", "Output width", "1024")
    .option("--height <number>", "Output height", "1024")
    .option("--js <path>", "Path to a JavaScript scene module")
    .option("--json <path>", "Path to a .rgl.json scene document")
    .option("--background <color>", "Background color, e.g. #111111")
    .option("--lighting <preset>", "Lighting preset: studio, flat, none", "studio")
    .option("--ambient-intensity <number>", "Ambient light intensity")
    .option("--key-intensity <number>", "Key light intensity")
    .option("--fill-intensity <number>", "Fill light intensity")
    .option("--rim-intensity <number>", "Rim light intensity")
    .option("--key-position <xyz>", "Key light position as x,y,z")
    .option("--fill-position <xyz>", "Fill light position as x,y,z")
    .option("--rim-position <xyz>", "Rim light position as x,y,z")
    .option(
      "--light <json>",
      'Add a custom scene light as JSON. Repeatable. Example: --light \'{"type":"point","position":[2,3,4],"intensity":1.2}\'',
      collect,
      [],
    )
    .option("--fov <number>", "Camera field of view")
    .option("--env-map <path>", "Path to an equirectangular .hdr or .ktx2 environment map")
    .option("--env-background", "Use the environment map as the scene background")
    .option("--env-blur <number>", "Background blur from 0 to 1 when using --env-background")
    .option("--env-intensity <number>", "Environment lighting intensity")
    .option("--dawn-flag <flag>", "Pass a Dawn flag", collect, []);
}

addSharedSceneOptions(program.command("render"))
  .argument("[file]", "Path to a .gltf or .glb asset")
  .option("--output <path>", "Output file path")
  .option("--format <format>", "Output format: png or webp")
  .option("--camera-position <xyz>", "Camera position as x,y,z")
  .option("--camera-target <xyz>", "Camera target as x,y,z")
  .option("--view <id>", "Scene view to render when using --json")
  .option("--sequence <id>", "Scene sequence to evaluate when using --json")
  .option("--time <seconds>", "Scene time in seconds when using --json", "0")
  .action(async (file, options) => {
    if (options.json) {
      if (file || options.js) {
        throw new Error(
          "Use either a GLTF/GLB <file>, --js <path>, or --json <path>, not more than one",
        );
      }

      const loaded = await loadSceneDocumentFile(options.json);
      const plan = buildSceneRenderPlan(loaded.path, options);
      const result = await renderSceneDocumentPasses({
        document: loaded.document,
        scenePath: loaded.path,
        time: plan.time,
        ...(plan.viewId ? { viewId: plan.viewId } : {}),
        ...(plan.sequenceId ? { sequenceId: plan.sequenceId } : {}),
        ...(plan.width !== undefined ? { width: plan.width } : {}),
        ...(plan.height !== undefined ? { height: plan.height } : {}),
        ...(plan.dawnFlags ? { dawnFlags: plan.dawnFlags } : {}),
      });

      await mkdir(dirname(plan.outputPath), { recursive: true });
      const writtenPasses: Array<{ passId: string; outputPath: string }> = [];

      for (const [passId, buffer] of Object.entries(result.buffers)) {
        const outputPath = resolveScenePassOutputPath(plan.outputPath, passId, plan.format);
        const encoded = await encodeImageToBuffer({
          pixels: buffer,
          width: result.output.width,
          height: result.output.height,
          format: plan.format,
        });
        await writeFile(outputPath, encoded);
        writtenPasses.push({ passId, outputPath });
      }

      console.log(
        JSON.stringify(
          {
            outputPath: plan.outputPath,
            passes: writtenPasses,
            viewId: result.viewId,
            output: result.output,
            diagnostics: result.diagnostics,
          },
          null,
          2,
        ),
      );
      return;
    }

    const plan = buildRenderPlan(file, options);

    if (plan.kind === "js") {
      const result = await renderSceneModule(plan);
      await mkdir(dirname(plan.outputPath), { recursive: true });
      await writeFile(plan.outputPath, result.buffer);

      console.log(
        JSON.stringify(
          {
            outputPath: plan.outputPath,
            diagnostics: result.diagnostics,
            modulePath: result.modulePath,
          },
          null,
          2,
        ),
      );
      return;
    }

    const result = await renderGltf(plan.render);
    await mkdir(dirname(plan.outputPath), { recursive: true });
    await writeFile(plan.outputPath, result.buffer);

    console.log(
      JSON.stringify(
        {
          outputPath: plan.outputPath,
          diagnostics: result.diagnostics,
          inspection: result.inspection,
        },
        null,
        2,
      ),
    );
  });

addSharedSceneOptions(program.command("video"))
  .argument("[file]", "Path to a .gltf or .glb asset")
  .requiredOption("--output <path>", "Output video path: .mp4, .mov, .webm, or .gif")
  .option(
    "--camera <preset>",
    "Camera motion for GLTF: turntable, dolly-in, dolly-out",
    "turntable",
  )
  .option("--fps <number>", "Frames per second", "30")
  .option("--duration <seconds>", "Clip length in seconds", "6")
  .option("--degrees <number>", "Turntable arc in degrees", "360")
  .option("--ease", "Ease camera motion in and out")
  .option("--crf <number>", "Encoder quality (lower is higher quality)")
  .option("--codec <codec>", "Override the video codec, e.g. libx264 or libvpx-vp9")
  .option("--no-loop", "Disable infinite looping for GIF output")
  .option("--view <id>", "Scene view to render when using --json")
  .option("--sequence <id>", "Scene sequence to render when using --json")
  .action(async (file, options, command) => {
    if (!(await isFfmpegAvailable())) {
      console.error(ffmpegInstallHint());
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      if (file || options.js) {
        throw new Error(
          "Use either a GLTF/GLB <file>, --js <path>, or --json <path>, not more than one",
        );
      }

      const loaded = await loadSceneDocumentFile(options.json);
      const plan = buildSceneVideoPlan(
        loaded.path,
        loaded.document,
        removeDefaultedSceneVideoOptions(options, command),
      );
      const result = await runSceneVideo({
        scenePath: loaded.path,
        document: loaded.document,
        plan,
      });

      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const plan = buildVideoPlan(file, options);
    const result = await runVideo(plan);

    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("inspect")
  .argument("<file>", "Path to a .gltf or .glb asset")
  .option("--json", "Emit JSON output", true)
  .action(async (file) => {
    const summary = await inspectGltfAsset(file);
    console.log(JSON.stringify(summary, null, 2));
  });

program
  .command("bench")
  .option("--width <number>", "Benchmark width", "1024")
  .option("--height <number>", "Benchmark height", "1024")
  .option("--iterations <number>", "Benchmark iterations", "10")
  .option("--format <format>", "Output format: png or webp")
  .option("--dawn-flag <flag>", "Pass a Dawn flag", collect, [])
  .action(async (options) => {
    const result = await runRendererBenchmark(buildBenchOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
