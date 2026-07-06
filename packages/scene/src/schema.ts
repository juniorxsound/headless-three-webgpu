import { z } from "zod";

const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "IDs may contain letters, numbers, ., _, and -");
const labelSchema = z.string().min(1).max(256);
const metadataSchema = z.record(z.string(), z.unknown());
const vec2Schema = z.tuple([z.number().finite(), z.number().finite()]);
const vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const vec4Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const hexColorSchema = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "Expected a hex color");
const pathSegmentSchema = "[A-Za-z0-9_][A-Za-z0-9_-]*";
const trackPathPattern = new RegExp(`^${pathSegmentSchema}(\\.${pathSegmentSchema})*$`);

export const sceneSchemaVersion = "rgl.scene/v1" as const;

export const sceneTransformSchema = z
  .object({
    position: vec3Schema.optional(),
    rotation: vec3Schema.optional(),
    quaternion: vec4Schema.optional(),
    scale: vec3Schema.optional(),
  })
  .strict();

export const sceneAssetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: idSchema,
      kind: z.literal("model"),
      label: labelSchema.optional(),
      sourcePath: z.string().min(1),
      metadata: metadataSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: idSchema,
      kind: z.literal("primitive"),
      label: labelSchema.optional(),
      primitive: z
        .object({
          type: z.enum(["box", "sphere", "cone", "cylinder", "plane", "grid"]),
        })
        .strict(),
      metadata: metadataSchema.optional(),
    })
    .strict(),
]);

export const sceneObjectSchema = z
  .object({
    id: idSchema,
    label: labelSchema.optional(),
    parentId: idSchema.optional(),
    visible: z.boolean().optional(),
    source: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("group") }).strict(),
        z.object({ type: z.literal("asset"), assetId: idSchema }).strict(),
      ])
      .default({ type: "group" }),
    transform: sceneTransformSchema.optional(),
    material: z
      .object({
        color: hexColorSchema.optional(),
      })
      .strict()
      .optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const sceneCameraSchema = z
  .object({
    id: idSchema,
    type: z.enum(["perspective", "orthographic"]),
    label: labelSchema.optional(),
    parentId: idSchema.optional(),
    visible: z.boolean().optional(),
    transform: sceneTransformSchema.optional(),
    target: vec3Schema.optional(),
    up: vec3Schema.optional(),
    fov: z.number().finite().positive().max(179).optional(),
    near: z.number().finite().positive().optional(),
    far: z.number().finite().positive().optional(),
    zoom: z.number().finite().positive().optional(),
    bounds: vec2Schema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const sceneLightSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        id: idSchema,
        type: z.literal("ambient"),
        label: labelSchema.optional(),
        parentId: idSchema.optional(),
        visible: z.boolean().optional(),
        color: hexColorSchema.optional(),
        intensity: z.number().finite().nonnegative().optional(),
        metadata: metadataSchema.optional(),
      })
      .strict(),
    z
      .object({
        id: idSchema,
        type: z.literal("directional"),
        label: labelSchema.optional(),
        parentId: idSchema.optional(),
        visible: z.boolean().optional(),
        transform: sceneTransformSchema.optional(),
        target: vec3Schema.optional(),
        color: hexColorSchema.optional(),
        intensity: z.number().finite().nonnegative().optional(),
        metadata: metadataSchema.optional(),
      })
      .strict(),
    z
      .object({
        id: idSchema,
        type: z.literal("hemisphere"),
        label: labelSchema.optional(),
        parentId: idSchema.optional(),
        visible: z.boolean().optional(),
        transform: sceneTransformSchema.optional(),
        color: hexColorSchema.optional(),
        groundColor: hexColorSchema.optional(),
        intensity: z.number().finite().nonnegative().optional(),
        metadata: metadataSchema.optional(),
      })
      .strict(),
    z
      .object({
        id: idSchema,
        type: z.literal("point"),
        label: labelSchema.optional(),
        parentId: idSchema.optional(),
        visible: z.boolean().optional(),
        transform: sceneTransformSchema.optional(),
        color: hexColorSchema.optional(),
        intensity: z.number().finite().nonnegative().optional(),
        distance: z.number().finite().nonnegative().optional(),
        decay: z.number().finite().nonnegative().optional(),
        metadata: metadataSchema.optional(),
      })
      .strict(),
    z
      .object({
        id: idSchema,
        type: z.literal("spot"),
        label: labelSchema.optional(),
        parentId: idSchema.optional(),
        visible: z.boolean().optional(),
        transform: sceneTransformSchema.optional(),
        target: vec3Schema.optional(),
        color: hexColorSchema.optional(),
        intensity: z.number().finite().nonnegative().optional(),
        distance: z.number().finite().nonnegative().optional(),
        decay: z.number().finite().nonnegative().optional(),
        angle: z
          .number()
          .finite()
          .positive()
          .max(Math.PI / 2)
          .optional(),
        penumbra: z.number().finite().min(0).max(1).optional(),
        metadata: metadataSchema.optional(),
      })
      .strict(),
  ])
  .superRefine((value: z.infer<typeof sceneLightSchema>, ctx: z.RefinementCtx) => {
    if (value.parentId && value.parentId === value.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Light parentId cannot reference itself.",
        path: ["parentId"],
      });
    }
  });

export const sceneRenderDefaultsSchema = z
  .object({
    output: z
      .object({
        width: z.number().int().positive().max(8192).optional(),
        height: z.number().int().positive().max(8192).optional(),
      })
      .strict()
      .optional(),
    background: hexColorSchema.optional(),
  })
  .strict();

export const sceneViewSchema = z
  .object({
    id: idSchema,
    label: labelSchema.optional(),
    cameraId: idSchema,
    output: z
      .object({
        width: z.number().int().positive().max(8192).optional(),
        height: z.number().int().positive().max(8192).optional(),
      })
      .strict()
      .optional(),
    background: hexColorSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const sceneTrackTargetSchema = z
  .object({
    type: z.enum(["object", "camera", "light", "view"]),
    id: idSchema,
    path: z
      .string()
      .min(1)
      .regex(trackPathPattern, "Track paths must use dotted property segments."),
  })
  .strict();

export const keyframeInterpolationSchema = z.enum(["hold", "linear", "bezier"]);
export const animationValueTypeSchema = z.enum([
  "number",
  "boolean",
  "string",
  "color",
  "vec2",
  "vec3",
  "vec4",
  "quat",
]);

export const keyframeValueSchema = z.union([
  z.number().finite(),
  z.boolean(),
  z.string(),
  vec2Schema,
  vec3Schema,
  vec4Schema,
]);

export const sceneKeyframeSchema = z
  .object({
    id: idSchema,
    time: z.number().finite(),
    value: keyframeValueSchema,
    interpolation: keyframeInterpolationSchema.optional(),
    handles: vec4Schema.optional(),
  })
  .strict();

export const sceneTrackSchema = z
  .object({
    id: idSchema,
    target: sceneTrackTargetSchema,
    valueType: animationValueTypeSchema,
    keyframes: z.record(idSchema, sceneKeyframeSchema),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value: z.infer<typeof sceneTrackSchema>, ctx: z.RefinementCtx) => {
    for (const [keyframeId, keyframe] of Object.entries(value.keyframes)) {
      if (keyframe.id !== keyframeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Keyframe map key "${keyframeId}" must match embedded id "${keyframe.id}".`,
          path: ["keyframes", keyframeId, "id"],
        });
      }

      if (!valueMatchesTrackType(value.valueType, keyframe.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Keyframe "${keyframeId}" does not match track valueType "${value.valueType}".`,
          path: ["keyframes", keyframeId, "value"],
        });
      }
    }
  });

export const sceneSequenceSchema = z
  .object({
    id: idSchema,
    label: labelSchema.optional(),
    duration: z.number().finite().positive().optional(),
    fps: z.number().int().positive().max(240).optional(),
    tracks: z.record(idSchema, sceneTrackSchema).default({}),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const sceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(sceneSchemaVersion),
    id: idSchema.optional(),
    workspaceId: idSchema.optional(),
    projectId: idSchema.optional(),
    revision: z.number().int().nonnegative().default(0),
    label: labelSchema.optional(),
    assets: z.record(idSchema, sceneAssetSchema).default({}),
    objects: z.record(idSchema, sceneObjectSchema).default({}),
    cameras: z.record(idSchema, sceneCameraSchema).default({}),
    lights: z.record(idSchema, sceneLightSchema).default({}),
    views: z.record(idSchema, sceneViewSchema).default({}),
    sequences: z.record(idSchema, sceneSequenceSchema).default({}),
    activeViewId: idSchema.optional(),
    activeSequenceId: idSchema.optional(),
    render: sceneRenderDefaultsSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value: z.infer<typeof sceneDocumentSchema>, ctx: z.RefinementCtx) => {
    const nodeIds = new Map<string, "object" | "camera" | "light">();
    const parentIds = new Map<string, string>();
    const nodePaths = new Map<string, (string | number)[]>();

    addRecordIdIssues(ctx, value.assets, "assets");
    addRecordIdIssues(ctx, value.objects, "objects");
    addRecordIdIssues(ctx, value.cameras, "cameras");
    addRecordIdIssues(ctx, value.lights, "lights");
    addRecordIdIssues(ctx, value.views, "views");
    addRecordIdIssues(ctx, value.sequences, "sequences");

    for (const node of Object.values(value.objects) as SceneObject[]) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id "${node.id}" across objects/cameras/lights.`,
          path: ["objects", node.id, "id"],
        });
      } else {
        nodeIds.set(node.id, "object");
      }
      nodePaths.set(node.id, ["objects", node.id, "parentId"]);

      if (node.parentId && !referencesNode(value, node.parentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Object parentId must reference an existing object, camera, or light.",
          path: ["objects", node.id, "parentId"],
        });
      }

      if (node.parentId === node.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Object parentId cannot reference itself.",
          path: ["objects", node.id, "parentId"],
        });
      }
      if (node.parentId) {
        parentIds.set(node.id, node.parentId);
      }

      if (node.source.type === "asset" && !value.assets[node.source.assetId]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Object assetId must reference an existing asset.",
          path: ["objects", node.id, "source", "assetId"],
        });
      }
    }

    for (const node of Object.values(value.cameras) as SceneCamera[]) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id "${node.id}" across objects/cameras/lights.`,
          path: ["cameras", node.id, "id"],
        });
      } else {
        nodeIds.set(node.id, "camera");
      }
      nodePaths.set(node.id, ["cameras", node.id, "parentId"]);

      if (node.parentId && !referencesNode(value, node.parentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Camera parentId must reference an existing object, camera, or light.",
          path: ["cameras", node.id, "parentId"],
        });
      }

      if (node.parentId === node.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Camera parentId cannot reference itself.",
          path: ["cameras", node.id, "parentId"],
        });
      }
      if (node.parentId) {
        parentIds.set(node.id, node.parentId);
      }
    }

    for (const node of Object.values(value.lights) as SceneLight[]) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id "${node.id}" across objects/cameras/lights.`,
          path: ["lights", node.id, "id"],
        });
      } else {
        nodeIds.set(node.id, "light");
      }
      nodePaths.set(node.id, ["lights", node.id, "parentId"]);

      if (node.parentId && !referencesNode(value, node.parentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Light parentId must reference an existing object, camera, or light.",
          path: ["lights", node.id, "parentId"],
        });
      }
      if (node.parentId) {
        parentIds.set(node.id, node.parentId);
      }
    }

    addParentCycleIssues(ctx, parentIds, nodePaths);

    if (value.activeViewId && !value.views[value.activeViewId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "activeViewId must reference an existing view.",
        path: ["activeViewId"],
      });
    }

    if (value.activeSequenceId && !value.sequences[value.activeSequenceId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "activeSequenceId must reference an existing sequence.",
        path: ["activeSequenceId"],
      });
    }

    for (const view of Object.values(value.views) as SceneView[]) {
      if (!value.cameras[view.cameraId]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "View cameraId must reference an existing camera.",
          path: ["views", view.id, "cameraId"],
        });
      }
    }

    for (const sequence of Object.values(value.sequences) as SceneSequence[]) {
      addRecordIdIssues(ctx, sequence.tracks, "tracks", ["sequences", sequence.id]);

      for (const track of Object.values(sequence.tracks) as SceneTrack[]) {
        if (!targetExists(value, track.target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Track target must reference an existing object, camera, light, or view.",
            path: ["sequences", sequence.id, "tracks", track.id, "target", "id"],
          });
          continue;
        }

        const expectedValueType = expectedTrackPathValueType(value, track.target);
        if (!expectedValueType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unsupported track target path "${track.target.path}".`,
            path: ["sequences", sequence.id, "tracks", track.id, "target", "path"],
          });
        } else if (!trackValueTypeMatchesExpected(track.valueType, expectedValueType)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Track path "${track.target.path}" expects valueType "${expectedValueType}".`,
            path: ["sequences", sequence.id, "tracks", track.id, "valueType"],
          });
        }
      }
    }
  });

function addRecordIdIssues(
  ctx: z.RefinementCtx,
  records: Record<string, { id: string }>,
  recordName: string,
  pathPrefix: (string | number)[] = [],
): void {
  for (const [key, value] of Object.entries(records)) {
    if (value.id !== key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${recordName} map key "${key}" must match embedded id "${value.id}".`,
        path: [...pathPrefix, recordName, key, "id"],
      });
    }
  }
}

function addParentCycleIssues(
  ctx: z.RefinementCtx,
  parentIds: ReadonlyMap<string, string>,
  nodePaths: ReadonlyMap<string, (string | number)[]>,
): void {
  const reported = new Set<string>();

  for (const nodeId of parentIds.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = nodeId;

    while (current) {
      if (visited.has(current)) {
        if (!reported.has(nodeId)) {
          reported.add(nodeId);
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Node "${nodeId}" has a cyclic parent relationship.`,
            path: nodePaths.get(nodeId) ?? [],
          });
        }
        break;
      }

      visited.add(current);
      current = parentIds.get(current);
    }
  }
}

function referencesNode(
  document: Pick<SceneDocument, "objects" | "cameras" | "lights">,
  nodeId: string,
): boolean {
  return Boolean(document.objects[nodeId] || document.cameras[nodeId] || document.lights[nodeId]);
}

function targetExists(
  document: Pick<SceneDocument, "objects" | "cameras" | "lights" | "views">,
  target: z.infer<typeof sceneTrackTargetSchema>,
): boolean {
  switch (target.type) {
    case "object":
      return Boolean(document.objects[target.id]);
    case "camera":
      return Boolean(document.cameras[target.id]);
    case "light":
      return Boolean(document.lights[target.id]);
    case "view":
      return Boolean(document.views[target.id]);
  }

  return false;
}

function valueMatchesTrackType(
  valueType: z.infer<typeof animationValueTypeSchema>,
  value: z.infer<typeof keyframeValueSchema>,
): boolean {
  switch (valueType) {
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "color":
      return typeof value === "string" && hexColorSchema.safeParse(value).success;
    case "vec2":
      return vec2Schema.safeParse(value).success;
    case "vec3":
      return vec3Schema.safeParse(value).success;
    case "vec4":
    case "quat":
      return vec4Schema.safeParse(value).success;
  }

  return false;
}

const objectTrackPathTypes = {
  visible: "boolean",
  "transform.position": "vec3",
  "transform.rotation": "vec3",
  "transform.quaternion": "quat",
  "transform.scale": "vec3",
  "material.color": "color",
} as const satisfies Record<string, z.infer<typeof animationValueTypeSchema>>;

const cameraTrackPathTypes = {
  visible: "boolean",
  "transform.position": "vec3",
  "transform.rotation": "vec3",
  "transform.quaternion": "quat",
  "transform.scale": "vec3",
  target: "vec3",
  up: "vec3",
  fov: "number",
  near: "number",
  far: "number",
  zoom: "number",
  bounds: "vec2",
} as const satisfies Record<string, z.infer<typeof animationValueTypeSchema>>;

const viewTrackPathTypes = {
  background: "color",
  "output.width": "number",
  "output.height": "number",
} as const satisfies Record<string, z.infer<typeof animationValueTypeSchema>>;

const commonLightTrackPathTypes = {
  visible: "boolean",
  color: "color",
  intensity: "number",
} as const satisfies Record<string, z.infer<typeof animationValueTypeSchema>>;

const positionedLightTrackPathTypes = {
  ...commonLightTrackPathTypes,
  "transform.position": "vec3",
  "transform.rotation": "vec3",
  "transform.quaternion": "quat",
  "transform.scale": "vec3",
} as const satisfies Record<string, z.infer<typeof animationValueTypeSchema>>;

const lightTrackPathTypes = {
  ambient: commonLightTrackPathTypes,
  directional: {
    ...positionedLightTrackPathTypes,
    target: "vec3",
  },
  hemisphere: {
    ...positionedLightTrackPathTypes,
    groundColor: "color",
  },
  point: {
    ...positionedLightTrackPathTypes,
    distance: "number",
    decay: "number",
  },
  spot: {
    ...positionedLightTrackPathTypes,
    target: "vec3",
    distance: "number",
    decay: "number",
    angle: "number",
    penumbra: "number",
  },
} as const satisfies Record<
  z.infer<typeof sceneLightSchema>["type"],
  Record<string, z.infer<typeof animationValueTypeSchema>>
>;

function readPathValueType(
  pathTypes: Record<string, z.infer<typeof animationValueTypeSchema>>,
  path: string,
): z.infer<typeof animationValueTypeSchema> | undefined {
  return pathTypes[path];
}

function expectedTrackPathValueType(
  document: Pick<SceneDocument, "objects" | "cameras" | "lights" | "views">,
  target: z.infer<typeof sceneTrackTargetSchema>,
): z.infer<typeof animationValueTypeSchema> | undefined {
  switch (target.type) {
    case "object":
      return readPathValueType(objectTrackPathTypes, target.path);
    case "camera":
      return readPathValueType(cameraTrackPathTypes, target.path);
    case "view":
      return readPathValueType(viewTrackPathTypes, target.path);
    case "light": {
      const light = document.lights[target.id];
      return light ? readPathValueType(lightTrackPathTypes[light.type], target.path) : undefined;
    }
  }

  return undefined;
}

function trackValueTypeMatchesExpected(
  valueType: z.infer<typeof animationValueTypeSchema>,
  expected: z.infer<typeof animationValueTypeSchema>,
): boolean {
  return valueType === expected || (valueType === "vec4" && expected === "quat");
}

export function parseSceneDocument(value: unknown): SceneDocument {
  return sceneDocumentSchema.parse(value);
}

export type SceneSchemaVersion = typeof sceneSchemaVersion;
export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
export type SceneAsset = z.infer<typeof sceneAssetSchema>;
export type SceneObject = z.infer<typeof sceneObjectSchema>;
export type SceneCamera = z.infer<typeof sceneCameraSchema>;
export type SceneLight = z.infer<typeof sceneLightSchema>;
export type SceneView = z.infer<typeof sceneViewSchema>;
export type SceneSequence = z.infer<typeof sceneSequenceSchema>;
export type SceneTrack = z.infer<typeof sceneTrackSchema>;
export type SceneKeyframe = z.infer<typeof sceneKeyframeSchema>;
export type SceneTrackTarget = z.infer<typeof sceneTrackTargetSchema>;
export type AnimationValueType = z.infer<typeof animationValueTypeSchema>;
export type KeyframeInterpolation = z.infer<typeof keyframeInterpolationSchema>;
export type KeyframeValue = z.infer<typeof keyframeValueSchema>;
