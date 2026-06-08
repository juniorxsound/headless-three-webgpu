#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Command } from "commander";
import { runRendererBenchmark } from "@rendergl/headless-three-webgpu";
import { inspectGltfAsset, renderGltf } from "@rendergl/headless-three-webgpu-helpers";

import { buildBenchOptions, buildRenderPlan, buildVideoPlan } from "./commands.js";
import { ffmpegInstallHint, isFfmpegAvailable } from "./encoder.js";
import { renderSceneModule } from "./render-js.js";
import { runVideo } from "./video.js";

const program = new Command();

program.name("rgl").description("@rendergl/headless-three-webgpu CLI").version("0.1.0");

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
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
  .action(async (file, options) => {
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
  .action(async (file, options) => {
    if (!(await isFfmpegAvailable())) {
      console.error(ffmpegInstallHint());
      process.exitCode = 1;
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
