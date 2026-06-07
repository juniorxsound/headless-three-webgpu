import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

type BlobTextureDiagnostics = {
  status: number | undefined;
  contentType: string | undefined;
  bytes: number | undefined;
  detectedFormat: string | undefined;
  signature: string | undefined;
};

type NodeDecodedImage = {
  width: number;
  height: number;
  data: Uint8Array;
  complete: true;
  __rawRgba: Uint8Array;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KTX2_SIGNATURE = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function bufferSignature(buffer: Buffer): string {
  return buffer.subarray(0, Math.min(12, buffer.length)).toString("hex");
}

function mimeTypeFromPath(filePath: string): string | undefined {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".ktx2":
      return "image/ktx2";
    default:
      return undefined;
  }
}

function detectBufferFormat(buffer: Buffer): string {
  if (
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return "png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "gif";
  }

  if (
    buffer.length >= KTX2_SIGNATURE.length &&
    buffer.subarray(0, KTX2_SIGNATURE.length).equals(KTX2_SIGNATURE)
  ) {
    return "ktx2";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    (buffer.subarray(8, 12).toString("ascii") === "avif" ||
      buffer.subarray(8, 12).toString("ascii") === "avis")
  ) {
    return "avif";
  }

  return "unknown";
}

function formatBlobTextureError(
  url: string,
  error: unknown,
  diagnostics: BlobTextureDiagnostics = {
    status: undefined,
    contentType: undefined,
    bytes: undefined,
    detectedFormat: undefined,
    signature: undefined,
  },
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const parts = [
    "ImageLoader: node texture decode failed",
    `url=${url.slice(0, 120)}`,
    diagnostics.status !== undefined ? `status=${diagnostics.status}` : null,
    diagnostics.contentType ? `contentType=${diagnostics.contentType}` : null,
    diagnostics.detectedFormat ? `detectedFormat=${diagnostics.detectedFormat}` : null,
    diagnostics.bytes !== undefined ? `bytes=${diagnostics.bytes}` : null,
    diagnostics.signature ? `signature=${diagnostics.signature}` : null,
    `cause=${message}`,
  ].filter(Boolean);
  return new Error(parts.join(" "), { cause: error });
}

async function loadBufferFromUrl(
  url: string,
): Promise<{ buffer: Buffer; contentType: string | undefined }> {
  if (url.startsWith("file://")) {
    const filePath = fileURLToPath(url);
    return {
      buffer: await readFile(filePath),
      contentType: mimeTypeFromPath(filePath),
    };
  }

  if (!/^[a-z]+:/i.test(url)) {
    return {
      buffer: await readFile(url),
      contentType: mimeTypeFromPath(url),
    };
  }

  const response = await fetch(url);
  const contentType = response.headers.get("content-type") ?? undefined;
  if (!response.ok) {
    throw formatBlobTextureError(url, "texture fetch returned non-OK status", {
      status: response.status,
      contentType,
      bytes: undefined,
      detectedFormat: undefined,
      signature: undefined,
    });
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}

export async function decodeTextureForNode(url: string): Promise<NodeDecodedImage> {
  const { buffer, contentType } = await loadBufferFromUrl(url);

  try {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });

    if (!info.width || !info.height) {
      throw new Error("sharp decode returned empty dimensions");
    }

    const rgba = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
    return {
      width: info.width,
      height: info.height,
      data: rgba,
      complete: true,
      __rawRgba: rgba,
    };
  } catch (error) {
    throw formatBlobTextureError(url, error, {
      contentType,
      detectedFormat: detectBufferFormat(buffer),
      bytes: buffer.byteLength,
      signature: bufferSignature(buffer),
      status: undefined,
    });
  }
}
