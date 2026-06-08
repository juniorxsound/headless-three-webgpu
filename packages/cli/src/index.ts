#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Command } from "commander";
import { runRendererBenchmark } from "@rendergl/headless-three-webgpu";
import { inspectGltfAsset, renderGltf } from "@rendergl/headless-three-webgpu-helpers";

import { buildBenchOptions, buildRenderPlan } from "./commands.js";
import { renderSceneModule } from "./render-js.js";

const program = new Command();

program.name("rgl").description("@rendergl/headless-three-webgpu CLI").version("0.1.0");

program
  .command("render")
  .argument("[file]", "Path to a .gltf or .glb asset")
  .option("--width <number>", "Output width", "1024")
  .option("--height <number>", "Output height", "1024")
  .option("--js <path>", "Path to a JavaScript scene module")
  .option("--output <path>", "Output file path")
  .option("--format <format>", "Output format: png or webp")
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
  .option("--camera-position <xyz>", "Camera position as x,y,z")
  .option("--camera-target <xyz>", "Camera target as x,y,z")
  .option("--fov <number>", "Camera field of view")
  .option("--dawn-flag <flag>", "Pass a Dawn flag", collect, [])
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

void program.parseAsync(process.argv);

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
