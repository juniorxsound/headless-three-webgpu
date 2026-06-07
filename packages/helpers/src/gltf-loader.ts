import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { WebGPURenderer } from "three/webgpu";

import { inlineGltfExternalResources } from "./gltf-document.js";
import { createNodeDracoDecoder } from "./node-draco-loader.js";
import { convertGltfTexturesForNodeWebGpu } from "./node-gltf-textures.js";
import { ensureNodeImagePolyfill } from "./node-image-polyfill.js";
import { createNodeKtx2Loader } from "./node-ktx2-loader.js";

type ParsedGltf = Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
const IGNORED_GLTF_EXTENSIONS = ["KHR_materials_variants"] as const;

function attachNodeDracoDecoder(loader: GLTFLoader): void {
  (
    loader as GLTFLoader & {
      setDRACOLoader(dracoLoader: unknown): GLTFLoader;
    }
  ).setDRACOLoader(createNodeDracoDecoder());
}

function attachNodeKtx2Loader(loader: GLTFLoader, ktx2Loader: KTX2Loader): void {
  (
    loader as GLTFLoader & {
      setKTX2Loader(ktx2Loader: KTX2Loader): GLTFLoader;
    }
  ).setKTX2Loader(ktx2Loader);
}

function attachIgnoredExtensions(loader: GLTFLoader): void {
  for (const extensionName of IGNORED_GLTF_EXTENSIONS) {
    loader.register(() => ({
      name: extensionName,
    }));
  }
}

function toExactArrayBuffer(source: ArrayBuffer | ArrayBufferView<ArrayBufferLike>): ArrayBuffer {
  if (source instanceof ArrayBuffer) {
    return source;
  }

  const { buffer, byteOffset, byteLength } = source;
  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer;
  }

  const exact = buffer.slice(byteOffset, byteOffset + byteLength);
  if (!(exact instanceof ArrayBuffer)) {
    throw new TypeError("Expected ArrayBuffer-compatible glTF input");
  }
  return exact;
}

export async function loadGltfFromFile(
  path: string,
  renderer: WebGPURenderer,
): Promise<ParsedGltf> {
  ensureNodeImagePolyfill();

  const extension = extname(path).toLowerCase();
  const loader = new GLTFLoader();
  attachNodeDracoDecoder(loader);
  attachIgnoredExtensions(loader);

  const ktx2Loader = await createNodeKtx2Loader(renderer);
  attachNodeKtx2Loader(loader, ktx2Loader);

  const source =
    extension === ".glb"
      ? new Uint8Array(await readFile(path))
      : await inlineGltfExternalResources(path);
  const previousCreateImageBitmap = globalThis.createImageBitmap;

  try {
    Reflect.set(globalThis as object, "createImageBitmap", undefined);
    const gltf = await loader.parseAsync(toExactArrayBuffer(source), "");
    convertGltfTexturesForNodeWebGpu(gltf.scene);
    return gltf;
  } finally {
    if (typeof previousCreateImageBitmap === "function") {
      Reflect.set(globalThis as object, "createImageBitmap", previousCreateImageBitmap);
    }
    ktx2Loader.dispose();
  }
}
