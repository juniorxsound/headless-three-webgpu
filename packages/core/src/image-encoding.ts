import sharp from "sharp";

import type { EncodeImageOptions } from "./types.js";

export async function encodeImageToBuffer(options: EncodeImageOptions): Promise<Uint8Array> {
  const base = sharp(Buffer.from(options.pixels), {
    raw: {
      width: options.width,
      height: options.height,
      channels: 4,
    },
  }).ensureAlpha();

  if (options.format === "png") {
    return base.png().toBuffer();
  }

  return base.webp({ quality: 92 }).toBuffer();
}
