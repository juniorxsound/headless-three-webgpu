#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Command } from "commander";
import { runRendererBenchmark } from "@rendergl/three-headless";
import { inspectGltfAsset, renderGltf } from "@rendergl/three-headless-helpers";

import { buildBenchOptions, buildRenderOptions } from "./commands.js";

const program = new Command();

program.name("rgl").description("@rendergl/three-headless CLI").version("0.1.0");

program
  .command("render")
  .argument("<file>", "Path to a .gltf or .glb asset")
  .option("--width <number>", "Output width", "1024")
  .option("--height <number>", "Output height", "1024")
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
  .option("--camera-position <xyz>", "Camera position as x,y,z")
  .option("--camera-target <xyz>", "Camera target as x,y,z")
  .option("--fov <number>", "Camera field of view")
  .option("--dawn-flag <flag>", "Pass a Dawn flag", collect, [])
  .option("--power-preference <mode>", "GPU power preference")
  .action(async (file, options) => {
    const resolved = buildRenderOptions(file, options);

    const result = await renderGltf(resolved.render);
    await mkdir(dirname(resolved.outputPath), { recursive: true });
    await writeFile(resolved.outputPath, result.buffer);

    console.log(
      JSON.stringify(
        {
          outputPath: resolved.outputPath,
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
  .option("--power-preference <mode>", "GPU power preference")
  .action(async (options) => {
    const result = await runRendererBenchmark(buildBenchOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

void program.parseAsync(process.argv);

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
