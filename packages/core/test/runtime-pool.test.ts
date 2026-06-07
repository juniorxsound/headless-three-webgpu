import { describe, expect, it } from "vitest";

import { RendererRuntimePool } from "../src/runtime-pool.js";

function createRuntimeFactory() {
  let createCount = 0;
  const lossTriggers: Array<() => void> = [];

  const factory = async () => {
    createCount += 1;
    let resolveLost!: (info: GPUDeviceLostInfo) => void;
    const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
      resolveLost = resolve;
    });
    lossTriggers.push(() =>
      resolveLost({ message: "lost", reason: "destroyed" } as GPUDeviceLostInfo),
    );

    return {
      gpu: { id: createCount } as unknown as GPU,
      adapter: {} as GPUAdapter,
      device: { lost } as GPUDevice,
      dawnFlags: [],
      diagnostics: {
        requestedAt: new Date().toISOString(),
        powerPreference: "high-performance" as GPUPowerPreference,
        dawnFlags: [],
        adapterRequestMs: 0,
        deviceRequestMs: 0,
        adapterInfo: null,
      },
      dispose: async () => undefined,
    };
  };

  return {
    factory,
    getCreateCount: () => createCount,
    loseDevice(index: number) {
      lossTriggers[index]?.();
    },
  };
}

describe("RendererRuntimePool", () => {
  it("reuses a warm runtime while the slot stays healthy", async () => {
    const runtimeFactory = createRuntimeFactory();
    const pool = new RendererRuntimePool(runtimeFactory.factory, 1);

    const firstLease = await pool.lease();
    firstLease.release();
    const secondLease = await pool.lease();
    secondLease.release();

    expect(runtimeFactory.getCreateCount()).toBe(1);
  });

  it("recreates a slot after device loss", async () => {
    const runtimeFactory = createRuntimeFactory();
    const pool = new RendererRuntimePool(runtimeFactory.factory, 1);

    const firstLease = await pool.lease();
    firstLease.release();
    runtimeFactory.loseDevice(0);
    await Promise.resolve();
    await Promise.resolve();

    const secondLease = await pool.lease();
    secondLease.release();

    expect(runtimeFactory.getCreateCount()).toBe(2);
  });

  it("wakes a waiting lease when a slot is released", async () => {
    const runtimeFactory = createRuntimeFactory();
    const pool = new RendererRuntimePool(runtimeFactory.factory, 1);

    const firstLease = await pool.lease();
    let resolved = false;
    const secondLeasePromise = pool.lease().then((lease) => {
      resolved = true;
      return lease;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    firstLease.release();
    const secondLease = await secondLeasePromise;
    secondLease.release();

    expect(resolved).toBe(true);
    expect(runtimeFactory.getCreateCount()).toBe(1);
  });

  it("does not poison a slot when runtime creation fails", async () => {
    let attempts = 0;
    const pool = new RendererRuntimePool(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("boom");
      }

      return {
        gpu: {} as GPU,
        adapter: {} as GPUAdapter,
        device: { lost: new Promise<GPUDeviceLostInfo>(() => undefined) } as GPUDevice,
        dawnFlags: [],
        diagnostics: {
          requestedAt: new Date().toISOString(),
          powerPreference: "high-performance" as GPUPowerPreference,
          dawnFlags: [],
          adapterRequestMs: 0,
          deviceRequestMs: 0,
          adapterInfo: null,
        },
        dispose: async () => undefined,
      };
    }, 1);

    await expect(pool.lease()).rejects.toThrow("boom");
    const lease = await pool.lease();
    lease.release();

    expect(attempts).toBe(2);
  });
});
