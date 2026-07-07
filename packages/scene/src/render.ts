import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";

import {
  createHeadlessWebGPURenderer,
  type HeadlessWebGPURenderer,
  type HeadlessWebGPURendererDiagnostics,
  type OutputFormat,
} from "@rendergl/headless-three-webgpu";
import { loadGltfFromFile } from "@rendergl/headless-three-webgpu-helpers";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SpotLight,
  Texture,
  type BufferGeometry,
  type Material,
} from "three";
import { pass } from "three/tsl";
import { vec4 } from "three/tsl";
import { RenderPipeline } from "three/webgpu";

import {
  evaluateSceneDocument,
  type EvaluateSceneOptions,
  type EvaluatedSceneState,
} from "./evaluator.js";
import {
  parseSceneDocument,
  type SceneAsset,
  type SceneDocument,
  type SceneLight,
  type SceneObject,
  type SceneView,
} from "./schema.js";

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const DEFAULT_CAMERA_NEAR = 0.1;
const DEFAULT_CAMERA_FAR = 2000;
const DEFAULT_CAMERA_FOV = 45;
const DEFAULT_ORTHOGRAPHIC_BOUNDS: readonly [number, number] = [5, 5];
const DEFAULT_OBJECT_SCALE: readonly [number, number, number] = [1, 1, 1];
const DEFAULT_BACKGROUND = "#101216";
const DEFAULT_LIGHT_COLOR = "#ffffff";
const DEFAULT_GROUND_COLOR = "#3b4351";
const DEFAULT_OBJECT_COLOR = "#cfd4dc";

const DEFAULT_RENDER_PASSES: readonly SceneRenderPassDefinition[] = [
  { id: "color", kind: "color" },
];

const SEMANTIC_RENDER_PASS_ORDER: readonly SceneRenderPassKind[] = ["depth"];

interface ResolvedOutput {
  width: number;
  height: number;
}

export type SceneRenderPassKind = "color" | "depth";

export interface SceneRenderPassDefinition {
  id: string;
  kind: SceneRenderPassKind;
}

interface SceneNodeBinding {
  object: Object3D;
  apply: (state: EvaluatedSceneState) => void;
}

interface LightBinding extends SceneNodeBinding {
  target?: Object3D;
}

interface LoadedResourceSet {
  readonly roots: Object3D[];
}

type TransformLike = {
  position?: [number, number, number] | undefined;
  rotation?: [number, number, number] | undefined;
  quaternion?: [number, number, number, number] | undefined;
  scale?: [number, number, number] | undefined;
};

type PassColorSpace = "srgb" | "linear";

type PersistentSceneRenderPassValue =
  | SceneRenderPassKind
  | {
      id?: string;
      kind?: SceneRenderPassKind;
      name?: string;
      pass?: SceneRenderPassKind;
    };

type SemanticRenderMetadata = {
  renderPasses?: PersistentSceneRenderPassValue[];
  outputs?: Record<string, unknown>;
};

function resolvePassColorSpace(passKind: SceneRenderPassKind): PassColorSpace {
  switch (passKind) {
    case "color":
      return "srgb";
    case "depth":
      return "linear";
  }
}

function normalizeSceneRenderPass(
  value: PersistentSceneRenderPassValue,
): SceneRenderPassDefinition | undefined {
  if (typeof value === "string" && isSceneRenderPassKind(value)) {
    return { id: value, kind: value };
  }

  if (typeof value === "string") {
    return undefined;
  }

  const kind = value.kind ?? value.pass;
  if (!kind || !isSceneRenderPassKind(kind)) {
    return undefined;
  }

  return {
    id: value.id ?? value.name ?? kind,
    kind,
  };
}

function isSceneRenderPassKind(value: string): value is SceneRenderPassKind {
  return value === "color" || value === "depth";
}

function readSemanticRenderMetadata(source: unknown): SemanticRenderMetadata | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const candidate = source as { renderPasses?: unknown; outputs?: unknown };
  const metadata: SemanticRenderMetadata = {};

  if (Array.isArray(candidate.renderPasses)) {
    metadata.renderPasses = candidate.renderPasses as PersistentSceneRenderPassValue[];
  }

  if (candidate.outputs && typeof candidate.outputs === "object") {
    metadata.outputs = candidate.outputs as Record<string, unknown>;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function resolveRequestedRenderPasses(
  document: SceneDocument,
  view: SceneView,
  passes: readonly SceneRenderPassDefinition[] | undefined,
): SceneRenderPassDefinition[] {
  if (passes && passes.length > 0) {
    return [...passes];
  }

  const viewMetadata = readSemanticRenderMetadata(view.metadata?.semantic);
  const documentMetadata = readSemanticRenderMetadata(document.metadata?.semantic);
  const explicitRenderPasses = viewMetadata?.renderPasses ?? documentMetadata?.renderPasses;

  if (explicitRenderPasses && explicitRenderPasses.length > 0) {
    const resolved = explicitRenderPasses
      .map(normalizeSceneRenderPass)
      .filter(
        (passDefinition): passDefinition is SceneRenderPassDefinition =>
          passDefinition !== undefined,
      );

    if (resolved.length > 0) {
      return resolved;
    }
  }

  const semanticOutputs = viewMetadata?.outputs ?? documentMetadata?.outputs;

  if (!semanticOutputs) {
    return [...DEFAULT_RENDER_PASSES];
  }

  const resolved: SceneRenderPassDefinition[] = [{ id: "color", kind: "color" }];
  for (const kind of SEMANTIC_RENDER_PASS_ORDER) {
    if (semanticOutputs[kind] === true) {
      resolved.push({ id: kind, kind });
    }
  }

  return resolved;
}

async function renderScenePass(
  prepared: PreparedSceneRender,
  passDefinition: SceneRenderPassDefinition,
): Promise<Uint8Array> {
  const renderer = prepared.renderer.unsafeGetWebGpuRenderer();
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(prepared.scene, prepared.getCamera());

  if (passDefinition.kind === "depth") {
    const depthNode = scenePass.getLinearDepthNode("depth");
    const white = vec4(1, 1, 1, 1);
    const depthVector = vec4(depthNode, depthNode, depthNode, 0);
    pipeline.outputNode = white.sub(depthVector);
  } else {
    pipeline.outputNode = scenePass;
  }

  pipeline.outputColorTransform = false;

  try {
    await scenePass.compileAsync(renderer);
    await prepared.renderer.renderPipeline(pipeline);
    const pixels = await prepared.renderer.readPixels({
      colorSpace: resolvePassColorSpace(passDefinition.kind),
    });
    return pixels;
  } finally {
    pipeline.dispose();
  }
}

export interface PrepareSceneRenderOptions extends EvaluateSceneOptions {
  readonly document: SceneDocument;
  readonly scenePath?: string;
  readonly viewId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly dawnFlags?: string[];
}

export interface LoadedSceneFile {
  readonly path: string;
  readonly document: SceneDocument;
}

export interface PreparedSceneRender {
  readonly renderer: HeadlessWebGPURenderer;
  readonly scene: Scene;
  readonly output: ResolvedOutput;
  readonly viewId: string;
  applyAt: (time: number, sequenceId?: string) => void;
  getCamera: () => PerspectiveCamera | OrthographicCamera;
  getCurrentState: () => EvaluatedSceneState;
  dispose: () => Promise<void>;
}

export interface RenderSceneDocumentOptions extends PrepareSceneRenderOptions {
  readonly format?: OutputFormat;
}

export interface RenderSceneDocumentResult {
  readonly buffer: Uint8Array;
  readonly diagnostics: HeadlessWebGPURendererDiagnostics;
  readonly output: ResolvedOutput;
  readonly viewId: string;
}

export interface RenderSceneDocumentPassesOptions extends PrepareSceneRenderOptions {
  readonly passes?: readonly SceneRenderPassDefinition[];
}

export interface RenderSceneDocumentPassesResult {
  readonly buffers: Record<string, Uint8Array>;
  readonly diagnostics: HeadlessWebGPURendererDiagnostics;
  readonly output: ResolvedOutput;
  readonly viewId: string;
}

export async function loadSceneDocumentFile(path: string): Promise<LoadedSceneFile> {
  const resolvedPath = resolvePath(path);
  const file = await readFile(resolvedPath, "utf8");
  return {
    path: resolvedPath,
    document: parseSceneDocument(JSON.parse(file)),
  };
}

function resolveView(document: SceneDocument, requestedViewId?: string): SceneView {
  if (requestedViewId) {
    const requestedView = document.views[requestedViewId];
    if (!requestedView) {
      throw new Error(`Unknown scene view "${requestedViewId}"`);
    }
    return requestedView;
  }

  if (document.activeViewId) {
    const activeView = document.views[document.activeViewId];
    if (activeView) {
      return activeView;
    }
  }

  const firstView = Object.values(document.views)[0];
  if (!firstView) {
    throw new Error("Scene document must define at least one view");
  }
  return firstView;
}

function resolveOutput(
  document: SceneDocument,
  view: SceneView,
  width?: number,
  height?: number,
): ResolvedOutput {
  return {
    width: width ?? view.output?.width ?? document.render?.output?.width ?? DEFAULT_WIDTH,
    height: height ?? view.output?.height ?? document.render?.output?.height ?? DEFAULT_HEIGHT,
  };
}

function createPrimitiveMaterial(color?: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color ?? DEFAULT_OBJECT_COLOR),
    side: DoubleSide,
  });
}

function createObjectFromPrimitive(asset: Extract<SceneAsset, { kind: "primitive" }>): Object3D {
  if (asset.kind !== "primitive") {
    throw new Error("Expected a primitive asset");
  }

  switch (asset.primitive.type) {
    case "box":
      return new Mesh(new BoxGeometry(1, 1, 1), createPrimitiveMaterial());
    case "sphere":
      return new Mesh(new SphereGeometry(0.5, 32, 16), createPrimitiveMaterial());
    case "cone":
      return new Mesh(new ConeGeometry(0.5, 1, 32), createPrimitiveMaterial());
    case "cylinder":
      return new Mesh(new CylinderGeometry(0.5, 0.5, 1, 32), createPrimitiveMaterial());
    case "plane":
      return new Mesh(new PlaneGeometry(1, 1), createPrimitiveMaterial());
    case "grid":
      return new GridHelper(10, 10, 0x6d7788, 0x313844);
  }

  throw new Error(`Unsupported primitive asset "${asset.primitive.type}"`);
}

function resolveAssetPath(scenePath: string | undefined, sourcePath: string): string {
  return scenePath ? resolvePath(dirname(scenePath), sourcePath) : resolvePath(sourcePath);
}

async function createObjectBinding(
  renderer: HeadlessWebGPURenderer,
  document: SceneDocument,
  scenePath: string | undefined,
  object: SceneObject,
): Promise<{ binding: SceneNodeBinding; resources: LoadedResourceSet }> {
  let threeObject: Object3D;

  if (object.source.type === "group") {
    threeObject = new Group();
  } else {
    const asset = document.assets[object.source.assetId];
    if (!asset) {
      throw new Error(`Object "${object.id}" references missing asset "${object.source.assetId}"`);
    }

    if (asset.kind === "primitive") {
      threeObject = createObjectFromPrimitive(asset);
    } else {
      const loaded = await loadGltfFromFile(
        resolveAssetPath(scenePath, asset.sourcePath),
        renderer.unsafeGetWebGpuRenderer(),
      );
      threeObject = loaded.scene;
    }
  }

  threeObject.userData.rglNodeId = object.id;

  return {
    binding: {
      object: threeObject,
      apply(state) {
        applyObjectState(threeObject, state.objects[object.id]);
      },
    },
    resources: { roots: [threeObject] },
  };
}

function createCameraBinding(camera: SceneDocument["cameras"][string]): SceneNodeBinding {
  const threeCamera: PerspectiveCamera | OrthographicCamera =
    camera.type === "perspective"
      ? new PerspectiveCamera(
          camera.fov ?? DEFAULT_CAMERA_FOV,
          1,
          camera.near ?? DEFAULT_CAMERA_NEAR,
          camera.far ?? DEFAULT_CAMERA_FAR,
        )
      : new OrthographicCamera(
          -(camera.bounds?.[0] ?? DEFAULT_ORTHOGRAPHIC_BOUNDS[0]),
          camera.bounds?.[0] ?? DEFAULT_ORTHOGRAPHIC_BOUNDS[0],
          camera.bounds?.[1] ?? DEFAULT_ORTHOGRAPHIC_BOUNDS[1],
          -(camera.bounds?.[1] ?? DEFAULT_ORTHOGRAPHIC_BOUNDS[1]),
          camera.near ?? DEFAULT_CAMERA_NEAR,
          camera.far ?? DEFAULT_CAMERA_FAR,
        );

  return {
    object: threeCamera,
    apply(state) {
      applyCameraState(threeCamera, state.cameras[camera.id]);
    },
  };
}

function createLightBinding(light: SceneLight): LightBinding {
  switch (light.type) {
    case "ambient": {
      const object = new AmbientLight(light.color ?? DEFAULT_LIGHT_COLOR, light.intensity ?? 1);
      return {
        object,
        apply(state) {
          applyLightState(object, undefined, state.lights[light.id]);
        },
      };
    }
    case "directional": {
      const target = new Object3D();
      const object = new DirectionalLight(light.color ?? DEFAULT_LIGHT_COLOR, light.intensity ?? 1);
      object.target = target;
      return {
        object,
        target,
        apply(state) {
          applyLightState(object, target, state.lights[light.id]);
        },
      };
    }
    case "hemisphere": {
      const object = new HemisphereLight(
        light.color ?? DEFAULT_LIGHT_COLOR,
        light.groundColor ?? DEFAULT_GROUND_COLOR,
        light.intensity ?? 1,
      );
      return {
        object,
        apply(state) {
          applyLightState(object, undefined, state.lights[light.id]);
        },
      };
    }
    case "point": {
      const object = new PointLight(
        light.color ?? DEFAULT_LIGHT_COLOR,
        light.intensity ?? 1,
        light.distance ?? 0,
        light.decay ?? 2,
      );
      return {
        object,
        apply(state) {
          applyLightState(object, undefined, state.lights[light.id]);
        },
      };
    }
    case "spot": {
      const target = new Object3D();
      const object = new SpotLight(
        light.color ?? DEFAULT_LIGHT_COLOR,
        light.intensity ?? 1,
        light.distance ?? 0,
        light.angle ?? Math.PI / 6,
        light.penumbra ?? 0,
        light.decay ?? 2,
      );
      object.target = target;
      return {
        object,
        target,
        apply(state) {
          applyLightState(object, target, state.lights[light.id]);
        },
      };
    }
  }

  throw new Error(`Unsupported light type "${String((light as { type?: unknown }).type)}"`);
}

function applyTransform(object: Object3D, transform: TransformLike | undefined): void {
  if (!transform) {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(DEFAULT_OBJECT_SCALE[0], DEFAULT_OBJECT_SCALE[1], DEFAULT_OBJECT_SCALE[2]);
    object.quaternion.set(0, 0, 0, 1);
    return;
  }

  const position = transform.position ?? [0, 0, 0];
  object.position.set(position[0], position[1], position[2]);

  if (transform.quaternion) {
    object.quaternion.set(
      transform.quaternion[0],
      transform.quaternion[1],
      transform.quaternion[2],
      transform.quaternion[3],
    );
  } else {
    object.rotation.set(
      transform.rotation?.[0] ?? 0,
      transform.rotation?.[1] ?? 0,
      transform.rotation?.[2] ?? 0,
    );
  }

  const scale = transform.scale ?? DEFAULT_OBJECT_SCALE;
  object.scale.set(scale[0], scale[1], scale[2]);
}

function applyObjectMaterial(object: Object3D, color?: string): void {
  if (!color) {
    return;
  }

  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standardMaterial = material as MeshStandardMaterial;
      if ("color" in standardMaterial && standardMaterial.color) {
        standardMaterial.color.set(color);
      }
    }
  });
}

function applyObjectState(object: Object3D, state: SceneObject | undefined): void {
  if (!state) {
    return;
  }

  object.visible = state.visible ?? true;
  applyTransform(object, state.transform);
  applyObjectMaterial(object, state.material?.color);
}

function applyCameraState(
  object: PerspectiveCamera | OrthographicCamera,
  state: SceneDocument["cameras"][string] | undefined,
): void {
  if (!state) {
    return;
  }

  object.visible = state.visible ?? true;
  applyTransform(object, state.transform);

  if (typeof state.zoom === "number") {
    object.zoom = state.zoom;
  }

  if (typeof state.near === "number") {
    object.near = state.near;
  }

  if (typeof state.far === "number") {
    object.far = state.far;
  }

  if (object instanceof PerspectiveCamera && typeof state.fov === "number") {
    object.fov = state.fov;
  }

  if (object instanceof OrthographicCamera && state.type === "orthographic") {
    const bounds = state.bounds ?? DEFAULT_ORTHOGRAPHIC_BOUNDS;
    object.left = -bounds[0];
    object.right = bounds[0];
    object.top = bounds[1];
    object.bottom = -bounds[1];
  }

  if (state.up) {
    object.up.set(state.up[0], state.up[1], state.up[2]);
  }

  if (state.target) {
    object.lookAt(state.target[0], state.target[1], state.target[2]);
  }

  object.updateProjectionMatrix();
}

function applyLightState(
  object: AmbientLight | DirectionalLight | HemisphereLight | PointLight | SpotLight,
  targetObject: Object3D | undefined,
  state: SceneLight | undefined,
): void {
  if (!state) {
    return;
  }

  object.visible = state.visible ?? true;
  object.color.set(state.color ?? DEFAULT_LIGHT_COLOR);
  object.intensity = state.intensity ?? 1;

  if (state.type !== "ambient") {
    applyTransform(object, state.transform);
  }

  if (state.type === "hemisphere" && object instanceof HemisphereLight) {
    object.groundColor.set(state.groundColor ?? DEFAULT_GROUND_COLOR);
  }

  if (
    (state.type === "point" && object instanceof PointLight) ||
    (state.type === "spot" && object instanceof SpotLight)
  ) {
    object.distance = state.distance ?? 0;
    object.decay = state.decay ?? 2;
  }

  if (state.type === "spot" && object instanceof SpotLight) {
    object.angle = state.angle ?? Math.PI / 6;
    object.penumbra = state.penumbra ?? 0;
  }

  if (targetObject && (state.type === "directional" || state.type === "spot") && state.target) {
    targetObject.position.set(state.target[0], state.target[1], state.target[2]);
    targetObject.updateMatrixWorld();
  }
}

function applySceneBackground(
  scene: Scene,
  document: SceneDocument,
  state: EvaluatedSceneState,
  viewId: string,
): void {
  const view = state.views[viewId];
  const background = view?.background ?? document.render?.background ?? DEFAULT_BACKGROUND;
  scene.background = new Color(background);
}

function resolveCameraForView(
  state: EvaluatedSceneState,
  viewId: string,
  cameras: Map<string, PerspectiveCamera | OrthographicCamera>,
): PerspectiveCamera | OrthographicCamera {
  const view = state.views[viewId];
  if (!view) {
    throw new Error(`Unknown evaluated view "${viewId}"`);
  }

  const camera = cameras.get(view.cameraId);
  if (!camera) {
    throw new Error(`View "${viewId}" resolves to unknown camera "${view.cameraId}"`);
  }
  return camera;
}

function setPerspectiveAspect(
  camera: PerspectiveCamera | OrthographicCamera,
  width: number,
  height: number,
): void {
  if (camera instanceof PerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function disposeMaterial(material: Material): void {
  const values = Object.values(material as Material & Record<string, unknown>);
  for (const value of values) {
    if (value && typeof value === "object" && (value as Texture).isTexture) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeSceneGraph(root: Object3D): void {
  root.traverse((object) => {
    const renderable = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };

    renderable.geometry?.dispose();

    if (renderable.material) {
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      for (const material of materials) {
        disposeMaterial(material);
      }
    }
  });
}

export async function prepareSceneRender(
  options: PrepareSceneRenderOptions,
): Promise<PreparedSceneRender> {
  const view = resolveView(options.document, options.viewId);
  const output = resolveOutput(options.document, view, options.width, options.height);
  const renderer = await createHeadlessWebGPURenderer({
    width: output.width,
    height: output.height,
    ...(options.dawnFlags && options.dawnFlags.length > 0 ? { dawnFlags: options.dawnFlags } : {}),
  });
  const scene = new Scene();
  const objectBindings = new Map<string, SceneNodeBinding>();
  const cameraBindings = new Map<string, SceneNodeBinding>();
  const lightBindings = new Map<string, LightBinding>();
  const cameras = new Map<string, PerspectiveCamera | OrthographicCamera>();
  const rootsToDispose: Object3D[] = [];
  const nodeObjects = new Map<string, Object3D>();

  try {
    for (const object of Object.values(options.document.objects) as SceneObject[]) {
      const created = await createObjectBinding(
        renderer,
        options.document,
        options.scenePath,
        object,
      );
      objectBindings.set(object.id, created.binding);
      nodeObjects.set(object.id, created.binding.object);
      rootsToDispose.push(...created.resources.roots);
    }

    for (const camera of Object.values(
      options.document.cameras,
    ) as SceneDocument["cameras"][string][]) {
      const binding = createCameraBinding(camera);
      cameraBindings.set(camera.id, binding);
      cameras.set(camera.id, binding.object as PerspectiveCamera | OrthographicCamera);
      nodeObjects.set(camera.id, binding.object);
      rootsToDispose.push(binding.object);
    }

    for (const light of Object.values(options.document.lights) as SceneLight[]) {
      const binding = createLightBinding(light);
      lightBindings.set(light.id, binding);
      nodeObjects.set(light.id, binding.object);
      rootsToDispose.push(binding.object);
      if (binding.target) {
        scene.add(binding.target);
        rootsToDispose.push(binding.target);
      }
    }

    const attachNode = (nodeId: string, parentId: string | undefined): void => {
      const node = nodeObjects.get(nodeId);
      if (!node) {
        return;
      }
      if (!parentId) {
        scene.add(node);
        return;
      }

      const parent = nodeObjects.get(parentId);
      if (!parent) {
        throw new Error(`Unable to resolve parent node "${parentId}" for "${nodeId}"`);
      }
      parent.add(node);
    };

    for (const object of Object.values(options.document.objects) as SceneObject[]) {
      attachNode(object.id, object.parentId);
    }
    for (const camera of Object.values(
      options.document.cameras,
    ) as SceneDocument["cameras"][string][]) {
      attachNode(camera.id, camera.parentId);
    }
    for (const light of Object.values(options.document.lights) as SceneLight[]) {
      attachNode(light.id, light.parentId);
    }

    let currentState = evaluateSceneDocument(options.document, {
      time: options.time ?? 0,
      ...(options.sequenceId ? { sequenceId: options.sequenceId } : {}),
    });

    const applyBindings = (): void => {
      for (const binding of objectBindings.values()) {
        binding.apply(currentState);
      }
      for (const binding of cameraBindings.values()) {
        binding.apply(currentState);
      }
      for (const binding of lightBindings.values()) {
        binding.apply(currentState);
      }
      applySceneBackground(scene, options.document, currentState, view.id);
    };

    applyBindings();

    return {
      renderer,
      scene,
      output,
      viewId: view.id,
      applyAt(time, sequenceId) {
        currentState = evaluateSceneDocument(options.document, {
          time,
          ...(sequenceId ? { sequenceId } : {}),
        });
        applyBindings();
      },
      getCamera() {
        const camera = resolveCameraForView(currentState, view.id, cameras);
        setPerspectiveAspect(camera, output.width, output.height);
        return camera;
      },
      getCurrentState() {
        return currentState;
      },
      async dispose() {
        for (const root of rootsToDispose) {
          disposeSceneGraph(root);
        }
        await renderer.dispose();
      },
    };
  } catch (error) {
    for (const root of rootsToDispose) {
      disposeSceneGraph(root);
    }
    await renderer.dispose();
    throw error;
  }
}

export async function renderSceneDocument(
  options: RenderSceneDocumentOptions,
): Promise<RenderSceneDocumentResult> {
  const prepared = await prepareSceneRender(options);
  try {
    prepared.applyAt(options.time ?? 0, options.sequenceId);
    await prepared.renderer.render(prepared.scene, prepared.getCamera());
    return {
      buffer: await prepared.renderer.toBuffer(options.format ?? "png"),
      diagnostics: prepared.renderer.getDiagnostics(),
      output: prepared.output,
      viewId: prepared.viewId,
    };
  } finally {
    await prepared.dispose();
  }
}

export async function renderSceneDocumentPasses(
  options: RenderSceneDocumentPassesOptions,
): Promise<RenderSceneDocumentPassesResult> {
  const prepared = await prepareSceneRender(options);
  const rendered: Record<string, Uint8Array> = {};
  const view = options.document.views[prepared.viewId];

  if (!view) {
    await prepared.dispose();
    throw new Error(`Unknown scene view "${prepared.viewId}"`);
  }

  try {
    prepared.applyAt(options.time ?? 0, options.sequenceId);
    const passDefinitions = resolveRequestedRenderPasses(options.document, view, options.passes);

    for (const passDefinition of passDefinitions) {
      rendered[passDefinition.id] = await renderScenePass(prepared, passDefinition);
    }

    return {
      buffers: rendered,
      diagnostics: prepared.renderer.getDiagnostics(),
      output: prepared.output,
      viewId: prepared.viewId,
    };
  } finally {
    await prepared.dispose();
  }
}
