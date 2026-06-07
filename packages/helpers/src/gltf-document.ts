import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LoadedGltfDocument } from "./types.js";

type GltfLikeDocument = LoadedGltfDocument["json"];

function isDataLikeUri(uri: string): boolean {
  return /^(data:|blob:|https?:|file:)/i.test(uri);
}

function mimeTypeFromPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".bin":
      return "application/octet-stream";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".ktx2":
      return "image/ktx2";
    default:
      return "application/octet-stream";
  }
}

function toDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function loadExternalUri(baseDir: string, uri: string): Promise<string> {
  if (/^file:/i.test(uri)) {
    const filePath = fileURLToPath(uri);
    const buffer = await readFile(filePath);
    return toDataUri(buffer, mimeTypeFromPath(filePath));
  }

  const targetPath = resolve(baseDir, uri);
  const buffer = await readFile(targetPath);
  return toDataUri(buffer, mimeTypeFromPath(targetPath));
}

function parseJsonDocument(buffer: Buffer): GltfLikeDocument {
  return JSON.parse(buffer.toString("utf8")) as GltfLikeDocument;
}

function parseGlbJson(buffer: Buffer): GltfLikeDocument {
  if (buffer.length < 20) {
    throw new Error("GLB file is too small to contain a valid header");
  }

  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);

  if (magic !== 0x46546c67) {
    throw new Error("Invalid GLB magic header");
  }
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}`);
  }
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("GLB is missing a JSON chunk");
  }

  const jsonChunk = buffer.subarray(20, 20 + jsonChunkLength);
  let jsonText = jsonChunk.toString("utf8");
  while (jsonText.endsWith("\u0000")) {
    jsonText = jsonText.slice(0, -1);
  }

  return parseJsonDocument(Buffer.from(jsonText));
}

export async function loadGltfDocument(path: string): Promise<LoadedGltfDocument> {
  const buffer = await readFile(path);
  const format = extname(path).toLowerCase() === ".glb" ? "glb" : "gltf";
  return {
    format,
    byteLength: buffer.byteLength,
    json: format === "glb" ? parseGlbJson(buffer) : parseJsonDocument(buffer),
  };
}

export async function inlineGltfExternalResources(path: string): Promise<Uint8Array> {
  const source = JSON.parse(await readFile(path, "utf8")) as GltfLikeDocument;
  const baseDir = dirname(path);

  if (source.buffers) {
    for (const buffer of source.buffers) {
      if (!buffer.uri || isDataLikeUri(buffer.uri)) {
        continue;
      }
      buffer.uri = await loadExternalUri(baseDir, buffer.uri);
    }
  }

  if (source.images) {
    for (const image of source.images) {
      if (!image.uri || isDataLikeUri(image.uri)) {
        continue;
      }
      image.uri = await loadExternalUri(baseDir, image.uri);
    }
  }

  return new TextEncoder().encode(JSON.stringify(source));
}
