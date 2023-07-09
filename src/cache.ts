import { VirtualModules } from "./types.js";

const cache = new Map<string, VirtualModules>();

function hashSource(hash: string, source: string) {
   return `${hash}:${source}`;
}

export function get(configHash: string, source: string) {
   return cache.get(hashSource(configHash, source));
}

export function set(
   configHash: string,
   source: string,
   virtualModules: VirtualModules
) {
   return cache.set(hashSource(configHash, source), virtualModules);
}

export function remove(configHash: string, source: string) {
   cache.delete(hashSource(configHash, source));
}

export function forEach(
   configHash: string,
   callback: (source: string) => void
) {
   cache.forEach((_, key) => {
      callback(key.replace(configHash + ":", ""));
   });
}
