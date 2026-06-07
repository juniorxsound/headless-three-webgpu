import { basename, dirname, extname, join } from "node:path";

import type { OutputFormat, RendererBenchmarkOptions } from "@rendergl/three-headless";
import {
  gltfLightingPresetSchema,
  renderGltfOptionsSchema,
  type RenderGltfCameraOptions,
  type RenderGltfLightingOptions,
  type RenderGltfOptions,
} from "@rendergl/three-headless-helpers";
import { z } from "zod";

const outputFormatSchema = z.enum(["png", "webp"]);
const powerPreferenceSchema = z.enum(["low-power", "high-performance"]);
const vector3ArgumentSchema = z.string().transform((value, context) => {
  const parts = value
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((segment) => Number.isFinite(segment));

  if (parts.length !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Expected a comma-separated vector with three numeric values, got "${value}"`,
    });
    return z.NEVER;
  }

  return [parts[0]!, parts[1]!, parts[2]!] as [number, number, number];
});

const renderCommandOptionsSchema = z.object({
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  format: outputFormatSchema.optional(),
  output: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  lighting: gltfLightingPresetSchema.optional(),
  ambientIntensity: z.coerce.number().finite().nonnegative().optional(),
  keyIntensity: z.coerce.number().finite().nonnegative().optional(),
  fillIntensity: z.coerce.number().finite().nonnegative().optional(),
  rimIntensity: z.coerce.number().finite().nonnegative().optional(),
  keyPosition: vector3ArgumentSchema.optional(),
  fillPosition: vector3ArgumentSchema.optional(),
  rimPosition: vector3ArgumentSchema.optional(),
  cameraPosition: vector3ArgumentSchema.optional(),
  cameraTarget: vector3ArgumentSchema.optional(),
  fov: z.coerce.number().finite().positive().optional(),
  dawnFlag: z.array(z.string().min(1)).default([]),
  powerPreference: powerPreferenceSchema.optional(),
});

const benchCommandOptionsSchema = z.object({
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  iterations: z.coerce.number().int().positive(),
  format: outputFormatSchema.optional(),
  dawnFlag: z.array(z.string().min(1)).default([]),
  powerPreference: powerPreferenceSchema.optional(),
});

interface RenderCommandResult {
  outputPath: string;
  render: RenderGltfOptions;
}

function assignDefined<T extends object, K extends keyof T>(
  target: Partial<T>,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function finalizeOptionalObject<T extends object>(value: Partial<T>): T | undefined {
  return Object.keys(value).length > 0 ? (value as T) : undefined;
}

export function parseVector3(value: string | undefined): [number, number, number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return vector3ArgumentSchema.parse(value);
}

export function resolveFormat(format: string | undefined, outputPath?: string): OutputFormat {
  if (format === "png" || format === "webp") {
    return format;
  }

  const extension = outputPath ? extname(outputPath).toLowerCase() : "";
  return extension === ".webp" ? "webp" : "png";
}

export function resolveOutputPath(
  sourcePath: string,
  outputPath: string | undefined,
  format: OutputFormat,
): string {
  if (outputPath) {
    return outputPath;
  }

  const name = basename(sourcePath, extname(sourcePath));
  return join(dirname(sourcePath), `${name}.${format}`);
}

function buildCameraOptions(
  options: z.infer<typeof renderCommandOptionsSchema>,
): RenderGltfCameraOptions | undefined {
  const camera: Partial<RenderGltfCameraOptions> = {};
  assignDefined(camera, "position", options.cameraPosition);
  assignDefined(camera, "target", options.cameraTarget);
  assignDefined(camera, "fov", options.fov);
  return finalizeOptionalObject<RenderGltfCameraOptions>(camera);
}

function buildLightingOptions(
  options: z.infer<typeof renderCommandOptionsSchema>,
): RenderGltfLightingOptions | undefined {
  const lighting: Partial<RenderGltfLightingOptions> = {};
  assignDefined(lighting, "preset", options.lighting);
  assignDefined(lighting, "ambientIntensity", options.ambientIntensity);
  assignDefined(lighting, "keyIntensity", options.keyIntensity);
  assignDefined(lighting, "fillIntensity", options.fillIntensity);
  assignDefined(lighting, "rimIntensity", options.rimIntensity);
  assignDefined(lighting, "keyPosition", options.keyPosition);
  assignDefined(lighting, "fillPosition", options.fillPosition);
  assignDefined(lighting, "rimPosition", options.rimPosition);
  return finalizeOptionalObject<RenderGltfLightingOptions>(lighting);
}

function buildRenderRequest(
  sourcePath: string,
  options: z.infer<typeof renderCommandOptionsSchema>,
): RenderGltfOptions {
  const format = resolveFormat(options.format, options.output);
  const lighting = buildLightingOptions(options);
  const camera = buildCameraOptions(options);
  const render: Partial<RenderGltfOptions> = {
    path: sourcePath,
    width: options.width,
    height: options.height,
    format,
  };
  assignDefined(render, "background", options.background);
  assignDefined(render, "lighting", lighting);
  assignDefined(render, "camera", camera);
  if (options.dawnFlag.length > 0) {
    render.dawnFlags = options.dawnFlag;
  }
  assignDefined(render, "powerPreference", options.powerPreference);
  renderGltfOptionsSchema.parse(render);
  return render as RenderGltfOptions;
}

export function buildRenderOptions(sourcePath: string, options: unknown): RenderCommandResult {
  const parsed = renderCommandOptionsSchema.parse(options);
  const format = resolveFormat(parsed.format, parsed.output);

  return {
    render: buildRenderRequest(sourcePath, parsed),
    outputPath: resolveOutputPath(sourcePath, parsed.output, format),
  };
}

export function buildBenchOptions(options: unknown): RendererBenchmarkOptions {
  const parsed = benchCommandOptionsSchema.parse(options);
  const benchmarkOptions: Partial<RendererBenchmarkOptions> = {
    width: parsed.width,
    height: parsed.height,
    iterations: parsed.iterations,
    format: resolveFormat(parsed.format),
  };
  if (parsed.dawnFlag.length > 0) {
    benchmarkOptions.dawnFlags = parsed.dawnFlag;
  }
  assignDefined(benchmarkOptions, "powerPreference", parsed.powerPreference);
  return benchmarkOptions as RendererBenchmarkOptions;
}
