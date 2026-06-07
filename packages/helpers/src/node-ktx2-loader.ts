import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Worker as NodeWorker, type TransferListItem } from "node:worker_threads";

import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import {
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
  Texture,
} from "three";
import type { WebGPURenderer } from "three/webgpu";

const require = createRequire(import.meta.url);

type BrowserLikeWorker = {
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
};

type MutableKtx2Loader = KTX2Loader & {
  _createTexture(buffer: ArrayBuffer, config?: object): Promise<Texture>;
  transcoderBinary: ArrayBuffer | null;
  transcoderPending: Promise<void> | null;
  workerConfig: {
    astcSupported: boolean;
    astcHDRSupported: boolean;
    bptcSupported: boolean;
    dxtSupported: boolean;
    etc1Supported: boolean;
    etc2Supported: boolean;
    pvrtcSupported: boolean;
  } | null;
  workerPool: {
    setWorkerCreator(createWorker: () => BrowserLikeWorker): void;
  };
};

type Ktx2LoaderRuntime = typeof KTX2Loader & {
  BasisFormat: unknown;
  BasisWorker: Function;
  EngineFormat: unknown;
  EngineType: unknown;
  TranscoderFormat: unknown;
};

let transcoderAssetsPromise: Promise<{ jsContent: string; wasmBinary: ArrayBuffer }> | null = null;

export async function loadNodeKtx2Texture(
  renderer: WebGPURenderer,
  arrayBuffer: ArrayBuffer,
): Promise<Texture> {
  const loader = await createNodeKtx2Loader(renderer);
  const mutableLoader = loader as MutableKtx2Loader;

  try {
    const texture = await mutableLoader._createTexture(arrayBuffer.slice(0), {});
    return normalizeHdrEnvironmentTexture(texture);
  } finally {
    loader.dispose();
  }
}

export async function createNodeKtx2Loader(renderer: WebGPURenderer): Promise<KTX2Loader> {
  const loader = new KTX2Loader() as MutableKtx2Loader;
  const loaderRuntime = KTX2Loader as Ktx2LoaderRuntime;
  loader.detectSupport(renderer);
  preferHalfFloatHdrEnvironmentTextures(loader);

  const { jsContent, wasmBinary } = await getTranscoderAssets();
  const workerBody = buildBasisWorkerSource(loaderRuntime, jsContent);

  loader.transcoderBinary = wasmBinary;
  loader.workerPool.setWorkerCreator(() => {
    const worker = createNodeWorker(workerBody);
    const transcoderBinary = getTranscoderBinaryCopy(loader);

    worker.postMessage({ type: "init", config: loader.workerConfig, transcoderBinary }, [
      transcoderBinary,
    ]);

    return worker;
  });
  loader.transcoderPending = Promise.resolve();

  return loader;
}

function preferHalfFloatHdrEnvironmentTextures(loader: MutableKtx2Loader): void {
  if (!loader.workerConfig) {
    throw new Error("KTX2 loader worker config was not initialized");
  }

  loader.workerConfig.astcHDRSupported = false;
  loader.workerConfig.bptcSupported = false;
}

function createNodeWorker(workerBody: string): BrowserLikeWorker {
  const worker = new NodeWorker(workerBody, { eval: true });

  return {
    addEventListener(type, listener) {
      if (type !== "message") {
        return;
      }
      worker.on("message", (data) => {
        listener({ data });
      });
    },
    postMessage(message, transfer) {
      worker.postMessage(message, (transfer ?? []) as readonly TransferListItem[]);
    },
    terminate() {
      void worker.terminate();
    },
  };
}

function buildBasisWorkerSource(loaderRuntime: Ktx2LoaderRuntime, jsContent: string): string {
  const workerFunctionSource = loaderRuntime.BasisWorker.toString();
  return [
    "const { parentPort } = require('node:worker_threads');",
    "const self = globalThis;",
    "self.postMessage = (message) => parentPort.postMessage(message);",
    "self.addEventListener = (type, listener) => {",
    "  if (type !== 'message') return;",
    "  parentPort.on('message', (data) => listener({ data }));",
    "};",
    `let _EngineFormat = ${JSON.stringify(loaderRuntime.EngineFormat)}`,
    `let _EngineType = ${JSON.stringify(loaderRuntime.EngineType)}`,
    `let _TranscoderFormat = ${JSON.stringify(loaderRuntime.TranscoderFormat)}`,
    `let _BasisFormat = ${JSON.stringify(loaderRuntime.BasisFormat)}`,
    jsContent,
    workerFunctionSource.substring(
      workerFunctionSource.indexOf("{") + 1,
      workerFunctionSource.lastIndexOf("}"),
    ),
  ].join("\n");
}

function getTranscoderBinaryCopy(loader: MutableKtx2Loader): ArrayBuffer {
  if (!loader.transcoderBinary) {
    throw new Error("KTX2 transcoder binary was not initialized");
  }
  return loader.transcoderBinary.slice(0);
}

async function getTranscoderAssets(): Promise<{ jsContent: string; wasmBinary: ArrayBuffer }> {
  if (!transcoderAssetsPromise) {
    transcoderAssetsPromise = loadTranscoderAssets();
  }
  return transcoderAssetsPromise;
}

async function loadTranscoderAssets(): Promise<{ jsContent: string; wasmBinary: ArrayBuffer }> {
  const jsPath = require.resolve("three/examples/jsm/libs/basis/basis_transcoder.js");
  const wasmPath = require.resolve("three/examples/jsm/libs/basis/basis_transcoder.wasm");
  const [jsContent, wasmBuffer] = await Promise.all([readFile(jsPath, "utf8"), readFile(wasmPath)]);

  return {
    jsContent,
    wasmBinary: wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength,
    ),
  };
}

function normalizeHdrEnvironmentTexture(texture: Texture): Texture {
  const candidate = texture as Texture & {
    format?: number;
    isCompressedTexture?: boolean;
    mipmaps?: Array<{
      data?: ArrayBufferView;
      width?: number;
      height?: number;
    }>;
    type?: number;
  };
  const firstMipmap = candidate.mipmaps?.[0];
  const shouldConvertToDataTexture =
    candidate.isCompressedTexture === true &&
    candidate.format === RGBAFormat &&
    candidate.type === HalfFloatType &&
    firstMipmap?.data instanceof Uint16Array &&
    typeof firstMipmap.width === "number" &&
    typeof firstMipmap.height === "number";

  if (!shouldConvertToDataTexture) {
    return texture;
  }

  const dataTexture = new DataTexture(
    firstMipmap.data as Uint16Array,
    firstMipmap.width,
    firstMipmap.height,
    RGBAFormat,
    HalfFloatType,
  );
  dataTexture.colorSpace = LinearSRGBColorSpace;
  dataTexture.magFilter = LinearFilter;
  dataTexture.minFilter = LinearFilter;
  dataTexture.generateMipmaps = false;
  dataTexture.needsUpdate = true;
  texture.dispose();
  return dataTexture;
}
