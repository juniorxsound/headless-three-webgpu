import { basename, dirname, extname, join } from "node:path";

import type { OutputFormat, RendererBenchmarkOptions } from "@rendergl/headless-three-webgpu";
import {
  gltfLightingPresetSchema,
  normalizeSceneLight,
  type RenderGltfEnvironmentOptions,
  renderGltfOptionsSchema,
  renderGltfSceneLightSchema,
  type RenderGltfCameraOptions,
  type RenderGltfLightingOptions,
  type RenderGltfOptions,
  type RenderGltfSceneLight,
} from "@rendergl/headless-three-webgpu-helpers";
import { z } from "zod";

const outputFormatSchema = z.enum(["png", "webp"]);
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
const lightArgumentSchema = z.string().transform((value, context) => {
  try {
    return renderGltfSceneLightSchema.parse(JSON.parse(value));
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        error instanceof Error
          ? `Expected --light to be valid JSON matching a scene light definition: ${error.message}`
          : "Expected --light to be valid JSON matching a scene light definition",
    });
    return z.NEVER;
  }
});

interface EnvironmentRefinementInput {
  envMap?: string | undefined;
  envBackground?: boolean | undefined;
  envBlur?: number | undefined;
  envIntensity?: number | undefined;
}

function refineEnvironmentOptions(
  value: EnvironmentRefinementInput,
  context: z.RefinementCtx,
): void {
  if (value.envMap !== undefined) {
    if (value.envBlur !== undefined && !value.envBackground) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use --env-background when setting --env-blur",
        path: ["envBlur"],
      });
    }
    return;
  }

  if (value.envBackground) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use --env-map when setting --env-background",
      path: ["envBackground"],
    });
  }

  if (value.envBlur !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use --env-map when setting --env-blur",
      path: ["envBlur"],
    });
  }

  if (value.envIntensity !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use --env-map when setting --env-intensity",
      path: ["envIntensity"],
    });
  }
}

const sharedRenderFields = {
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  background: z.string().min(1).optional(),
  lighting: gltfLightingPresetSchema.optional(),
  ambientIntensity: z.coerce.number().finite().nonnegative().optional(),
  keyIntensity: z.coerce.number().finite().nonnegative().optional(),
  fillIntensity: z.coerce.number().finite().nonnegative().optional(),
  rimIntensity: z.coerce.number().finite().nonnegative().optional(),
  keyPosition: vector3ArgumentSchema.optional(),
  fillPosition: vector3ArgumentSchema.optional(),
  rimPosition: vector3ArgumentSchema.optional(),
  light: z.array(lightArgumentSchema).default([]),
  cameraPosition: vector3ArgumentSchema.optional(),
  cameraTarget: vector3ArgumentSchema.optional(),
  fov: z.coerce.number().finite().positive().optional(),
  envMap: z.string().min(1).optional(),
  envBackground: z.boolean().optional(),
  envBlur: z.coerce.number().finite().min(0).max(1).optional(),
  envIntensity: z.coerce.number().finite().positive().max(10).optional(),
  dawnFlag: z.array(z.string().min(1)).default([]),
} as const;

const sharedRenderSchema = z.object(sharedRenderFields);
type SharedRenderOptions = z.infer<typeof sharedRenderSchema>;

const renderCommandOptionsSchema = z
  .object({
    ...sharedRenderFields,
    js: z.string().min(1).optional(),
    format: outputFormatSchema.optional(),
    output: z.string().min(1).optional(),
  })
  .superRefine(refineEnvironmentOptions);

const videoCameraPresetSchema = z.enum(["turntable", "dolly-in", "dolly-out"]);

const videoContainerSchema = z.enum(["mp4", "mov", "webm", "gif"]);

const videoCommandOptionsSchema = z
  .object({
    ...sharedRenderFields,
    js: z.string().min(1).optional(),
    output: z.string().min(1),
    camera: videoCameraPresetSchema.default("turntable"),
    fps: z.coerce.number().int().positive().max(240).default(30),
    duration: z.coerce.number().finite().positive().max(600).default(6),
    degrees: z.coerce.number().finite().default(360),
    ease: z.boolean().optional(),
    crf: z.coerce.number().int().min(0).max(63).optional(),
    codec: z.string().min(1).optional(),
    loop: z.boolean().optional(),
  })
  .superRefine(refineEnvironmentOptions);

const benchCommandOptionsSchema = z.object({
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  iterations: z.coerce.number().int().positive(),
  format: outputFormatSchema.optional(),
  dawnFlag: z.array(z.string().min(1)).default([]),
});

interface RenderCommandResult {
  outputPath: string;
  render: RenderGltfOptions;
}

interface GltfRenderCommandResult extends RenderCommandResult {
  kind: "gltf";
}

interface JsRenderCommandResult {
  dawnFlags?: string[];
  format: OutputFormat;
  height: number;
  kind: "js";
  modulePath: string;
  outputPath: string;
  width: number;
}

type RenderExecutionPlan = GltfRenderCommandResult | JsRenderCommandResult;

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

export function parseLight(value: string): RenderGltfSceneLight {
  return normalizeSceneLight(lightArgumentSchema.parse(value));
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

function resolveRenderSource(
  file: string | undefined,
  jsPath: string | undefined,
): { kind: "gltf"; sourcePath: string } | { kind: "js"; modulePath: string } {
  if (file && jsPath) {
    throw new Error("Use either a GLTF/GLB <file> argument or --js <path>, not both");
  }

  if (jsPath) {
    return {
      kind: "js",
      modulePath: jsPath,
    };
  }

  if (file) {
    return {
      kind: "gltf",
      sourcePath: file,
    };
  }

  throw new Error("Provide either a GLTF/GLB <file> argument or --js <path>");
}

function buildCameraOptions(options: SharedRenderOptions): RenderGltfCameraOptions | undefined {
  const camera: Partial<RenderGltfCameraOptions> = {};
  assignDefined(camera, "position", options.cameraPosition);
  assignDefined(camera, "target", options.cameraTarget);
  assignDefined(camera, "fov", options.fov);
  return finalizeOptionalObject<RenderGltfCameraOptions>(camera);
}

function buildLightingOptions(options: SharedRenderOptions): RenderGltfLightingOptions | undefined {
  const lighting: Partial<RenderGltfLightingOptions> = {};
  assignDefined(lighting, "preset", options.lighting);
  assignDefined(lighting, "ambientIntensity", options.ambientIntensity);
  assignDefined(lighting, "keyIntensity", options.keyIntensity);
  assignDefined(lighting, "fillIntensity", options.fillIntensity);
  assignDefined(lighting, "rimIntensity", options.rimIntensity);
  assignDefined(lighting, "keyPosition", options.keyPosition);
  assignDefined(lighting, "fillPosition", options.fillPosition);
  assignDefined(lighting, "rimPosition", options.rimPosition);
  if (options.light.length > 0) {
    lighting.lights = options.light.map(normalizeSceneLight);
  }
  return finalizeOptionalObject<RenderGltfLightingOptions>(lighting);
}

function buildEnvironmentOptions(
  options: SharedRenderOptions,
): RenderGltfEnvironmentOptions | undefined {
  if (!options.envMap) {
    return undefined;
  }

  const environment: Partial<RenderGltfEnvironmentOptions> = {
    path: options.envMap,
  };
  assignDefined(environment, "background", options.envBackground);
  assignDefined(environment, "blur", options.envBlur);
  assignDefined(environment, "intensity", options.envIntensity);
  return environment as RenderGltfEnvironmentOptions;
}

function buildRenderRequest(
  sourcePath: string,
  options: SharedRenderOptions,
  format: OutputFormat,
): RenderGltfOptions {
  const lighting = buildLightingOptions(options);
  const environment = buildEnvironmentOptions(options);
  const camera = buildCameraOptions(options);
  const render: Partial<RenderGltfOptions> = {
    path: sourcePath,
    width: options.width,
    height: options.height,
    format,
  };
  assignDefined(render, "background", options.background);
  assignDefined(render, "lighting", lighting);
  assignDefined(render, "environment", environment);
  assignDefined(render, "camera", camera);
  if (options.dawnFlag.length > 0) {
    render.dawnFlags = options.dawnFlag;
  }
  renderGltfOptionsSchema.parse(render);
  return render as RenderGltfOptions;
}

function gltfResultFromParsed(
  sourcePath: string,
  parsed: z.infer<typeof renderCommandOptionsSchema>,
): RenderCommandResult {
  const format = resolveFormat(parsed.format, parsed.output);

  return {
    render: buildRenderRequest(sourcePath, parsed, format),
    outputPath: resolveOutputPath(sourcePath, parsed.output, format),
  };
}

export function buildRenderOptions(sourcePath: string, options: unknown): RenderCommandResult {
  return gltfResultFromParsed(sourcePath, renderCommandOptionsSchema.parse(options));
}

export function buildRenderPlan(file: string | undefined, options: unknown): RenderExecutionPlan {
  const parsed = renderCommandOptionsSchema.parse(options);
  const format = resolveFormat(parsed.format, parsed.output);
  const source = resolveRenderSource(file, parsed.js);

  if (source.kind === "js") {
    if (parsed.envMap !== undefined) {
      throw new Error("Environment map options are currently only supported for GLTF/GLB renders");
    }

    return {
      kind: "js",
      modulePath: source.modulePath,
      outputPath: resolveOutputPath(source.modulePath, parsed.output, format),
      width: parsed.width,
      height: parsed.height,
      format,
      ...(parsed.dawnFlag.length > 0 ? { dawnFlags: parsed.dawnFlag } : {}),
    };
  }

  return {
    kind: "gltf",
    ...gltfResultFromParsed(source.sourcePath, parsed),
  };
}

export type VideoCameraPreset = z.infer<typeof videoCameraPresetSchema>;
export type VideoContainer = z.infer<typeof videoContainerSchema>;

interface VideoEncodeBase {
  container: VideoContainer;
  outputPath: string;
  fps: number;
  durationSeconds: number;
  frames: number;
  width: number;
  height: number;
  crf?: number;
  codec?: string;
  loop?: boolean;
}

interface GltfVideoPlan extends VideoEncodeBase {
  kind: "gltf";
  render: RenderGltfOptions;
  camera: VideoCameraPreset;
  degrees: number;
  ease: boolean;
}

interface JsVideoPlan extends VideoEncodeBase {
  kind: "js";
  modulePath: string;
  dawnFlags?: string[];
}

export type VideoExecutionPlan = GltfVideoPlan | JsVideoPlan;

const videoContainerByExtension: Record<string, VideoContainer> = {
  ".mp4": "mp4",
  ".mov": "mov",
  ".webm": "webm",
  ".gif": "gif",
};

export function resolveVideoContainer(outputPath: string): VideoContainer {
  const extension = extname(outputPath).toLowerCase();
  const container = videoContainerByExtension[extension];
  if (!container) {
    throw new Error(
      `Unsupported video output "${outputPath}". Use a .mp4, .mov, .webm, or .gif extension`,
    );
  }
  return container;
}

function assertEncodableDimensions(width: number, height: number, container: VideoContainer): void {
  if (container === "gif") {
    return;
  }

  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error(
      `${container} output uses yuv420p and requires even --width and --height (got ${width}x${height})`,
    );
  }
}

export function buildVideoPlan(file: string | undefined, options: unknown): VideoExecutionPlan {
  const parsed = videoCommandOptionsSchema.parse(options);
  const container = resolveVideoContainer(parsed.output);
  assertEncodableDimensions(parsed.width, parsed.height, container);
  const frames = Math.max(1, Math.round(parsed.duration * parsed.fps));
  const source = resolveRenderSource(file, parsed.js);

  const base: VideoEncodeBase = {
    container,
    outputPath: parsed.output,
    fps: parsed.fps,
    durationSeconds: parsed.duration,
    frames,
    width: parsed.width,
    height: parsed.height,
    ...(parsed.crf !== undefined ? { crf: parsed.crf } : {}),
    ...(parsed.codec !== undefined ? { codec: parsed.codec } : {}),
    ...(parsed.loop !== undefined ? { loop: parsed.loop } : {}),
  };

  if (source.kind === "js") {
    if (parsed.envMap !== undefined) {
      throw new Error("Environment map options are currently only supported for GLTF/GLB renders");
    }

    return {
      kind: "js",
      modulePath: source.modulePath,
      ...base,
      ...(parsed.dawnFlag.length > 0 ? { dawnFlags: parsed.dawnFlag } : {}),
    };
  }

  return {
    kind: "gltf",
    render: buildRenderRequest(source.sourcePath, parsed, "png"),
    camera: parsed.camera,
    degrees: parsed.degrees,
    ease: parsed.ease ?? false,
    ...base,
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
  return benchmarkOptions as RendererBenchmarkOptions;
}
