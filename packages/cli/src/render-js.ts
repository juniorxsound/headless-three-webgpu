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

type JsSceneModuleFactory =
  | JsSceneModuleResult
  | ((context: JsSceneModuleContext) => Promise<JsSceneModuleResult> | JsSceneModuleResult);

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

function resolveSceneModuleExport(moduleExports: Record<string, unknown>): JsSceneModuleFactory {
  const candidate = moduleExports.default ?? moduleExports.createScene;

  if (!candidate) {
    throw new Error(
      'Scene module must export a default value or named "createScene" function returning { scene, camera }',
    );
  }

  return candidate as JsSceneModuleFactory;
}

export async function loadSceneModule(
  modulePath: string,
  context: JsSceneModuleContext,
): Promise<JsSceneModuleResult> {
  const resolvedModulePath = resolve(modulePath);
  const loaded = (await import(pathToFileURL(resolvedModulePath).href)) as Record<string, unknown>;
  const sceneModule = resolveSceneModuleExport(loaded);
  const result = typeof sceneModule === "function" ? await sceneModule(context) : sceneModule;

  if (!isSceneModuleResult(result)) {
    throw new Error(
      `Scene module "${resolvedModulePath}" must resolve to an object with { scene, camera }`,
    );
  }

  return result;
}

export async function renderSceneModule(
  options: JsSceneRenderOptions,
): Promise<JsSceneRenderResult> {
  const resolvedModulePath = resolve(options.modulePath);
  const { scene, camera } = await loadSceneModule(resolvedModulePath, {
    width: options.width,
    height: options.height,
  });
  const renderer = await createHeadlessWebGPURenderer({
    width: options.width,
    height: options.height,
    ...(options.dawnFlags && options.dawnFlags.length > 0 ? { dawnFlags: options.dawnFlags } : {}),
  });

  try {
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
