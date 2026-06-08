import { z } from "zod";

const vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const lightColorSchema = z.union([z.string().min(1), z.number().finite().nonnegative()]);

export const gltfLightingPresetSchema = z.enum(["studio", "flat", "none"]);

export const renderGltfSceneLightSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ambient"),
      color: lightColorSchema.optional(),
      intensity: z.number().finite().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("directional"),
      color: lightColorSchema.optional(),
      intensity: z.number().finite().nonnegative().optional(),
      position: vector3Schema,
    })
    .strict(),
  z
    .object({
      type: z.literal("hemisphere"),
      skyColor: lightColorSchema.optional(),
      groundColor: lightColorSchema.optional(),
      intensity: z.number().finite().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("point"),
      color: lightColorSchema.optional(),
      intensity: z.number().finite().nonnegative().optional(),
      position: vector3Schema,
      distance: z.number().finite().nonnegative().optional(),
      decay: z.number().finite().nonnegative().optional(),
    })
    .strict(),
]);

export const renderGltfLightingOptionsSchema = z
  .object({
    preset: gltfLightingPresetSchema.optional(),
    ambientIntensity: z.number().finite().nonnegative().optional(),
    keyIntensity: z.number().finite().nonnegative().optional(),
    fillIntensity: z.number().finite().nonnegative().optional(),
    rimIntensity: z.number().finite().nonnegative().optional(),
    keyPosition: vector3Schema.optional(),
    fillPosition: vector3Schema.optional(),
    rimPosition: vector3Schema.optional(),
    lights: z.array(renderGltfSceneLightSchema).optional(),
  })
  .strict();

export const renderGltfCameraOptionsSchema = z
  .object({
    position: vector3Schema.optional(),
    target: vector3Schema.optional(),
    fov: z.number().finite().positive().optional(),
    useEmbeddedCamera: z.boolean().optional(),
  })
  .strict();

export const renderGltfOptionsSchema = z
  .object({
    path: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    format: z.enum(["png", "webp"]).optional(),
    background: z.string().min(1).optional(),
    lighting: z.union([gltfLightingPresetSchema, renderGltfLightingOptionsSchema]).optional(),
    camera: renderGltfCameraOptionsSchema.optional(),
    dawnFlags: z.array(z.string().min(1)).optional(),
  })
  .strict();
