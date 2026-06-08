import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createHeadlessWebGPURenderer,
  type HeadlessWebGPURendererDiagnostics,
  type OutputFormat,
} from "@rendergl/headless-three-webgpu";
import type { Camera, Scene } from "three";

interface JsSceneModuleContext {
  width: number;
  height: number;
}

interface JsSceneModuleResult {
  scene: Scene;
  camera: Camera;
}

type JsSceneModuleUpdate = (delta: number) => Promise<void> | void;

interface JsSceneModuleExports {
  setup: (context: JsSceneModuleContext) => Promise<JsSceneModuleResult> | JsSceneModuleResult;
  update?: JsSceneModuleUpdate;
}

interface JsSceneRenderOptions {
  modulePath: string;
  width: number;
  height: number;
  format: OutputFormat;
  dawnFlags?: string[];
}

interface JsSceneRenderResult {
  buffer: Uint8Array;
  diagnostics: HeadlessWebGPURendererDiagnostics;
  modulePath: string;
}

function isSceneModuleResult(value: unknown): value is JsSceneModuleResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<JsSceneModuleResult> & {
    scene?: { isScene?: boolean };
    camera?: { isCamera?: boolean };
  };
  return candidate.scene?.isScene === true && candidate.camera?.isCamera === true;
}

function resolveSceneModuleExports(moduleExports: Record<string, unknown>): JsSceneModuleExports {
  if (typeof moduleExports.setup !== "function") {
    throw new Error(
      'Scene module must export a named "setup({ width, height })" function returning { scene, camera }',
    );
  }

  if (moduleExports.update !== undefined && typeof moduleExports.update !== "function") {
    throw new Error('Scene module export "update" must be a function when provided');
  }

  return {
    setup: moduleExports.setup as JsSceneModuleExports["setup"],
    ...(typeof moduleExports.update === "function"
      ? { update: moduleExports.update as JsSceneModuleUpdate }
      : {}),
  };
}

export async function loadSceneModule(
  modulePath: string,
  context: JsSceneModuleContext,
): Promise<JsSceneModuleResult & { update?: JsSceneModuleUpdate }> {
  const resolvedModulePath = resolve(modulePath);
  const loaded = (await import(pathToFileURL(resolvedModulePath).href)) as Record<string, unknown>;
  const sceneModule = resolveSceneModuleExports(loaded);
  const result = await sceneModule.setup(context);

  if (!isSceneModuleResult(result)) {
    throw new Error(
      `Scene module "${resolvedModulePath}" setup() must resolve to an object with { scene, camera }`,
    );
  }

  return {
    ...result,
    ...(sceneModule.update ? { update: sceneModule.update } : {}),
  };
}

export async function renderSceneModule(
  options: JsSceneRenderOptions,
): Promise<JsSceneRenderResult> {
  const resolvedModulePath = resolve(options.modulePath);
  const { scene, camera, update } = await loadSceneModule(resolvedModulePath, {
    width: options.width,
    height: options.height,
  });
  const renderer = await createHeadlessWebGPURenderer({
    width: options.width,
    height: options.height,
    ...(options.dawnFlags && options.dawnFlags.length > 0 ? { dawnFlags: options.dawnFlags } : {}),
  });

  try {
    if (update) {
      await update(0);
    }

    await renderer.render(scene, camera);
    const buffer = await renderer.toBuffer(options.format);

    return {
      buffer,
      diagnostics: renderer.getDiagnostics(),
      modulePath: resolvedModulePath,
    };
  } finally {
    await renderer.dispose();
  }
}
