import { Cache, ImageLoader } from "three";

import { decodeTextureForNode } from "./node-image-decoder.js";

const PATCH_MARK = Symbol("patchImageLoaderForNode");

function imageCacheKey(url: string): string {
  return `image:${url}`;
}

function shouldHandleInNode(url: string): boolean {
  return !url.toLowerCase().endsWith(".ktx2");
}

export function patchImageLoaderForNode(): void {
  if (typeof process === "undefined" || !process.versions?.node) {
    return;
  }

  const currentLoad = ImageLoader.prototype.load as typeof ImageLoader.prototype.load & {
    [PATCH_MARK]?: true;
  };
  if (currentLoad[PATCH_MARK]) {
    return;
  }

  const originalLoad = ImageLoader.prototype.load;
  const patchedLoad = function patchedLoad(
    this: InstanceType<typeof ImageLoader>,
    url: string,
    onLoad?: (image: HTMLImageElement) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) {
    if (this.path !== undefined) {
      url = this.path + url;
    }
    url = this.manager.resolveURL(url);

    if (!shouldHandleInNode(url)) {
      return originalLoad.call(this, url, onLoad, undefined, onError);
    }

    const cacheKey = imageCacheKey(url);
    const cached = Cache.get(cacheKey);
    if (cached !== undefined) {
      this.manager.itemStart(url);
      setTimeout(() => {
        onLoad?.(cached as HTMLImageElement);
        this.manager.itemEnd(url);
      }, 0);
      return cached as HTMLImageElement;
    }

    this.manager.itemStart(url);
    void decodeTextureForNode(url)
      .then((image) => {
        Cache.add(cacheKey, image);
        onLoad?.(image as unknown as HTMLImageElement);
        this.manager.itemEnd(url);
      })
      .catch((error) => {
        onError?.(error);
        this.manager.itemError(url);
        this.manager.itemEnd(url);
      });

    return {} as HTMLImageElement;
  };

  patchedLoad[PATCH_MARK] = true;
  ImageLoader.prototype.load = patchedLoad;
}
