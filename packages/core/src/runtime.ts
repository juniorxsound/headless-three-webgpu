import { create, globals } from "webgpu";

import type {
  RendererAdapterInfoSnapshot,
  RendererRuntime,
  RendererRuntimeOptions,
} from "./types.js";

export const RGL_DAWN_FLAGS_ENV = "RGL_DAWN_FLAGS";

const NO_NAVIGATOR = Symbol("no navigator");

let previousNavigator: Navigator | typeof NO_NAVIGATOR = NO_NAVIGATOR;
let navigatorInstalled = false;
let activeGpu: GPU | null = null;
let activeFlagsKey: string | null = null;
let installationCount = 0;

function applyWebGpuGlobals(): void {
  Object.assign(globalThis, globals);
}

function installNavigatorGpu(gpu: GPU): void {
  if (!navigatorInstalled) {
    previousNavigator =
      typeof globalThis.navigator === "undefined" ? NO_NAVIGATOR : globalThis.navigator;
  }

  const value = {
    gpu,
    userAgent:
      typeof process !== "undefined" && process.versions?.node
        ? `node/${process.versions.node}`
        : "node",
  };

  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });

  navigatorInstalled = true;
}

function installMinimalDocument(): void {
  if (typeof globalThis.document !== "undefined") {
    return;
  }

  globalThis.document = {
    createElementNS(_namespace: string, tagName: string) {
      if (tagName !== "canvas") {
        throw new Error(`Unsupported element request: ${tagName}`);
      }

      return {
        width: 300,
        height: 150,
        style: {} as Partial<CSSStyleDeclaration>,
        setAttribute: () => undefined,
        getContext: () => null,
      };
    },
  } as unknown as Document;
}

function installSelf(): void {
  if (typeof globalThis.self === "undefined") {
    (globalThis as unknown as { self?: typeof globalThis }).self = globalThis;
  }
}

function installAnimationFramePolyfills(): void {
  const value = globalThis as typeof globalThis & {
    requestAnimationFrame?: typeof requestAnimationFrame;
    cancelAnimationFrame?: typeof cancelAnimationFrame;
  };

  if (!value.requestAnimationFrame) {
    value.requestAnimationFrame = (callback) =>
      setTimeout(() => callback(performance.now()), 0) as unknown as number;
  }

  if (!value.cancelAnimationFrame) {
    value.cancelAnimationFrame = (handle) => {
      clearTimeout(handle as unknown as number);
    };
  }
}

export function parseDawnFlags(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[;\n]/)
    .map((flag) => flag.trim())
    .filter((flag) => flag.length > 0);
}

export function formatDawnFlagsForEnv(flags: string[]): string {
  return flags.join(";");
}

export function resolveWebGpuDawnFlags(
  options: RendererRuntimeOptions = {},
  env = process.env,
): string[] {
  if (options.dawnFlags && options.dawnFlags.length > 0) {
    return options.dawnFlags;
  }

  return parseDawnFlags(env[RGL_DAWN_FLAGS_ENV]);
}

export function installWebGpuNodePolyfills(options: RendererRuntimeOptions = {}): GPU {
  applyWebGpuGlobals();
  const dawnFlags = resolveWebGpuDawnFlags(options);
  const flagsKey = formatDawnFlagsForEnv(dawnFlags);

  if (!activeGpu) {
    activeGpu = create(dawnFlags);
    activeFlagsKey = flagsKey;
  } else if (activeFlagsKey !== flagsKey) {
    throw new Error(
      "Cannot install WebGPU polyfills with a different Dawn flag set while another runtime is active",
    );
  }

  installNavigatorGpu(activeGpu);
  installMinimalDocument();
  installSelf();
  installAnimationFramePolyfills();
  installationCount += 1;

  return activeGpu;
}

export function releaseWebGpuNodePolyfills(): void {
  if (installationCount === 0) {
    return;
  }

  installationCount -= 1;
  if (installationCount > 0) {
    return;
  }

  if (previousNavigator === NO_NAVIGATOR) {
    Reflect.deleteProperty(globalThis, "navigator");
  } else {
    Object.defineProperty(globalThis, "navigator", {
      value: previousNavigator,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  activeGpu = null;
  activeFlagsKey = null;
  previousNavigator = NO_NAVIGATOR;
  navigatorInstalled = false;
}

async function snapshotAdapterInfo(
  adapter: GPUAdapter,
): Promise<RendererAdapterInfoSnapshot | null> {
  const adapterWithInfo = adapter as GPUAdapter & {
    info?: GPUAdapterInfo;
    requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
  };

  try {
    const info =
      adapterWithInfo.info ??
      (typeof adapterWithInfo.requestAdapterInfo === "function"
        ? await adapterWithInfo.requestAdapterInfo()
        : undefined);

    if (!info) {
      return null;
    }

    const snapshot: RendererAdapterInfoSnapshot = {};
    if (info.vendor) {
      snapshot.vendor = info.vendor;
    }
    if (info.architecture) {
      snapshot.architecture = info.architecture;
    }
    if (info.device) {
      snapshot.device = info.device;
    }
    if (info.description) {
      snapshot.description = info.description;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export async function createRendererRuntime(
  options: RendererRuntimeOptions = {},
): Promise<RendererRuntime> {
  const powerPreference = options.powerPreference ?? "high-performance";
  const dawnFlags = resolveWebGpuDawnFlags(options);
  const requestedAt = new Date().toISOString();
  const gpu = installWebGpuNodePolyfills({ ...options, dawnFlags });
  let disposed = false;

  try {
    const adapterStartedAt = performance.now();
    const adapter = await gpu.requestAdapter({ powerPreference });
    const adapterRequestMs = performance.now() - adapterStartedAt;
    if (!adapter) {
      throw new Error("Dawn did not return a GPU adapter");
    }

    const deviceStartedAt = performance.now();
    const [adapterInfo, device] = await Promise.all([
      snapshotAdapterInfo(adapter),
      adapter.requestDevice(),
    ]);
    const deviceRequestMs = performance.now() - deviceStartedAt;

    return {
      gpu,
      adapter,
      device,
      dawnFlags,
      diagnostics: {
        requestedAt,
        powerPreference,
        dawnFlags,
        adapterRequestMs,
        deviceRequestMs,
        adapterInfo,
      },
      async dispose() {
        if (disposed) {
          return;
        }

        disposed = true;
        try {
          device.destroy?.();
        } catch {
          return;
        } finally {
          releaseWebGpuNodePolyfills();
        }
      },
    };
  } catch (error) {
    releaseWebGpuNodePolyfills();
    throw error;
  }
}

installSelf();
