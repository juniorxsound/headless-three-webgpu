import { z } from "zod";

const vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const powerPreferenceSchema = z.enum(["low-power", "high-performance"]);

export const gltfLightingPresetSchema = z.enum(["studio", "flat", "none"]);

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
    powerPreference: powerPreferenceSchema.optional(),
  })
  .strict();
