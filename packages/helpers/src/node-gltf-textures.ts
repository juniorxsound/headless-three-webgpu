import {
  CompressedTexture,
  CubeTexture,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  type Material,
  type Mesh,
  type Object3D,
  type Sprite,
  type Texture,
} from "three";

type MaterialRecord = Material & Record<string, unknown>;

type NodeRawImage = {
  width: number;
  height: number;
  __rawRgba?: Uint8Array;
  data?: Uint8Array | Uint8ClampedArray;
};

function getRawRgba(image: unknown): Uint8Array | null {
  if (!image || typeof image !== "object") {
    return null;
  }

  const rawImage = image as NodeRawImage;
  if (rawImage.__rawRgba instanceof Uint8Array) {
    return rawImage.__rawRgba;
  }

  if (rawImage.data instanceof Uint8Array) {
    return rawImage.data;
  }

  if (rawImage.data instanceof Uint8ClampedArray) {
    return new Uint8Array(
      rawImage.data.buffer.slice(
        rawImage.data.byteOffset,
        rawImage.data.byteOffset + rawImage.data.byteLength,
      ),
    );
  }

  return null;
}

function toDataTexture(texture: Texture, rgba: Uint8Array, width: number, height: number): DataTexture {
  const dataTexture = new DataTexture(new Uint8Array(rgba), width, height, RGBAFormat, UnsignedByteType);
  dataTexture.name = texture.name;
  dataTexture.colorSpace = texture.colorSpace;
  dataTexture.flipY = texture.flipY;
  dataTexture.wrapS = texture.wrapS;
  dataTexture.wrapT = texture.wrapT;
  dataTexture.repeat.copy(texture.repeat);
  dataTexture.offset.copy(texture.offset);
  dataTexture.center.copy(texture.center);
  dataTexture.rotation = texture.rotation;
  dataTexture.minFilter = texture.minFilter;
  dataTexture.magFilter = texture.magFilter;
  dataTexture.anisotropy = texture.anisotropy;
  dataTexture.generateMipmaps = texture.generateMipmaps;
  dataTexture.userData = { ...texture.userData };
  dataTexture.needsUpdate = true;
  return dataTexture;
}

function getRawImage(texture: Texture): { rgba: Uint8Array; width: number; height: number } | null {
  const image = texture.image as NodeRawImage | null;
  if (!image || typeof image.width !== "number" || typeof image.height !== "number") {
    return null;
  }

  const rgba = getRawRgba(image);
  if (!rgba) {
    return null;
  }

  return { rgba, width: image.width, height: image.height };
}

function materialTextureEntries(material: MaterialRecord): Array<[string, Texture]> {
  const entries: Array<[string, Texture]> = [];

  for (const key of Object.keys(material)) {
    const value = material[key];
    if (!value || typeof value !== "object" || !(value as Texture).isTexture) {
      continue;
    }
    entries.push([key, value as Texture]);
  }

  return entries;
}

function patchMaterialTextures(material: Material, textureCache: Map<Texture, DataTexture>): void {
  const materialRecord = material as MaterialRecord;

  for (const [key, texture] of materialTextureEntries(materialRecord)) {
    if (texture instanceof CubeTexture || texture instanceof CompressedTexture) {
      continue;
    }

    const rawImage = getRawImage(texture);
    if (!rawImage) {
      continue;
    }

    const existing = textureCache.get(texture);
    if (existing) {
      materialRecord[key] = existing;
      continue;
    }

    const dataTexture = toDataTexture(texture, rawImage.rgba, rawImage.width, rawImage.height);
    textureCache.set(texture, dataTexture);
    materialRecord[key] = dataTexture;
  }
}

export function convertGltfTexturesForNodeWebGpu(root: Object3D): void {
  if (typeof process === "undefined" || !process.versions?.node) {
    return;
  }

  const textureCache = new Map<Texture, DataTexture>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => patchMaterialTextures(material, textureCache));
      return;
    }

    const sprite = object as Sprite;
    if (sprite.isSprite && sprite.material) {
      patchMaterialTextures(sprite.material, textureCache);
    }
  });

  textureCache.forEach((_dataTexture, originalTexture) => {
    originalTexture.dispose();
  });
}
