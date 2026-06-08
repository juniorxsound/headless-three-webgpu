import { describe, expect, it } from "vitest";

import { buildFfmpegArgs } from "../src/encoder.js";

const baseOptions = {
  outputPath: "/tmp/out",
  width: 640,
  height: 480,
  fps: 30,
} as const;

describe("buildFfmpegArgs", () => {
  it("configures a raw RGBA input stream from stdin", () => {
    const args = buildFfmpegArgs({ ...baseOptions, container: "mp4" });
    expect(args).toEqual(
      expect.arrayContaining([
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        "640x480",
        "-r",
        "30",
        "-i",
        "-",
      ]),
    );
    expect(args.at(-1)).toBe("/tmp/out");
  });

  it("uses h264 with faststart for mp4 output", () => {
    const args = buildFfmpegArgs({ ...baseOptions, container: "mp4", crf: 20 });
    expect(args).toEqual(
      expect.arrayContaining(["-c:v", "libx264", "-crf", "20", "-movflags", "+faststart"]),
    );
  });

  it("uses vp9 for webm output and honors a codec override", () => {
    const args = buildFfmpegArgs({ ...baseOptions, container: "webm", codec: "libvpx" });
    expect(args).toEqual(expect.arrayContaining(["-c:v", "libvpx", "-pix_fmt", "yuv420p"]));
  });

  it("builds a palette pipeline and loops gif output by default", () => {
    const args = buildFfmpegArgs({ ...baseOptions, container: "gif" });
    expect(args.join(" ")).toContain("palettegen");
    expect(args).toEqual(expect.arrayContaining(["-loop", "0"]));
  });

  it("disables gif looping when loop is false", () => {
    const args = buildFfmpegArgs({ ...baseOptions, container: "gif", loop: false });
    expect(args).toEqual(expect.arrayContaining(["-loop", "-1"]));
  });
});
