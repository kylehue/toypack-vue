import { LoadResult } from "toypack/types";
import { VirtualModules } from "./types.js";

const cache = new Map<string, LoadResult>();

function hashSource(hash: string, source: string) {
   return `${hash}:${source}`;
}

export function get(configHash: string, source: string) {
   return cache.get(hashSource(configHash, source));
}

export function set(configHash: string, source: string, content: LoadResult) {
   return cache.set(hashSource(configHash, source), content);
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
