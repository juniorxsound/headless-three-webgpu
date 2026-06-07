import type { RendererRuntime } from "./types.js";

export type RuntimeFactory = () => Promise<RendererRuntime>;

interface RuntimeSlot {
  contextPromise: Promise<RendererRuntime> | null;
  runtime: RendererRuntime | null;
  generation: number;
}

export interface RuntimeLease {
  runtime: RendererRuntime;
  release(): void;
}

export class RendererRuntimePool {
  private readonly slots: RuntimeSlot[];
  private readonly availableSlots: number[];
  private readonly waiters: Array<(slotIndex: number) => void> = [];

  constructor(
    private readonly createRuntime: RuntimeFactory,
    poolSize = 1,
  ) {
    if (poolSize < 1) {
      throw new Error("RendererRuntimePool requires at least one slot");
    }

    this.slots = Array.from({ length: poolSize }, () => ({
      contextPromise: null,
      runtime: null,
      generation: 0,
    }));
    this.availableSlots = this.slots.map((_, index) => index);
  }

  async lease(): Promise<RuntimeLease> {
    const slotIndex = await this.acquireSlotIndex();
    const slot = this.slots[slotIndex]!;

    if (!slot.contextPromise) {
      slot.contextPromise = this.createRuntimeForSlot(slotIndex, slot);
    }

    try {
      const runtime = await slot.contextPromise;
      return {
        runtime,
        release: () => this.releaseSlotIndex(slotIndex),
      };
    } catch (error) {
      this.invalidateSlot(slotIndex, slot.generation);
      this.releaseSlotIndex(slotIndex);
      throw error;
    }
  }

  async reset(): Promise<void> {
    await Promise.all(
      this.slots.map(async (slot) => {
        await slot.runtime?.dispose();
        slot.runtime = null;
        slot.contextPromise = null;
        slot.generation += 1;
      }),
    );

    this.availableSlots.splice(
      0,
      this.availableSlots.length,
      ...this.slots.map((_, index) => index),
    );
    this.waiters.length = 0;
  }

  private async createRuntimeForSlot(
    slotIndex: number,
    slot: RuntimeSlot,
  ): Promise<RendererRuntime> {
    const generation = slot.generation;
    const runtime = await this.createRuntime();
    slot.runtime = runtime;

    runtime.device.lost
      .then(() => {
        this.invalidateSlot(slotIndex, generation);
      })
      .catch(() => {
        this.invalidateSlot(slotIndex, generation);
      });

    return runtime;
  }

  private invalidateSlot(slotIndex: number, generation: number): void {
    const slot = this.slots[slotIndex]!;
    if (slot.generation !== generation) {
      return;
    }

    void slot.runtime?.dispose();
    slot.runtime = null;
    slot.contextPromise = null;
    slot.generation += 1;
  }

  private async acquireSlotIndex(): Promise<number> {
    const slotIndex = this.availableSlots.shift();
    if (slotIndex !== undefined) {
      return slotIndex;
    }

    return new Promise<number>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private releaseSlotIndex(slotIndex: number): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(slotIndex);
      return;
    }

    this.availableSlots.push(slotIndex);
  }
}
