import { patchImageLoaderForNode } from "./patch-image-loader-node.js";

let installed = false;

export function ensureNodeImagePolyfill(): void {
  if (installed) {
    return;
  }

  if (typeof process === "undefined" || !process.versions?.node) {
    installed = true;
    return;
  }

  patchImageLoaderForNode();
  installed = true;
}
