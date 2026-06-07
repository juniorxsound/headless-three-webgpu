import { describe, expect, it } from "vitest";

import { formatDawnFlagsForEnv, parseDawnFlags, resolveWebGpuDawnFlags } from "../src/runtime.js";

describe("runtime helpers", () => {
  it("parses Dawn flags from semicolon-delimited env strings", () => {
    expect(parseDawnFlags("backend=vulkan;adapter=llvmpipe")).toEqual([
      "backend=vulkan",
      "adapter=llvmpipe",
    ]);
  });

  it("formats flags for env round-tripping", () => {
    expect(formatDawnFlagsForEnv(["backend=metal", "adapter=Default"])).toBe(
      "backend=metal;adapter=Default",
    );
  });

  it("prefers explicit options over environment flags", () => {
    expect(
      resolveWebGpuDawnFlags(
        {
          dawnFlags: ["backend=opengl"],
        },
        {
          HTW_DAWN_FLAGS: "backend=vulkan",
        } as NodeJS.ProcessEnv,
      ),
    ).toEqual(["backend=opengl"]);
  });
});
