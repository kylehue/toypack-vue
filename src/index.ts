import { Plugin } from "toypack/types";
import * as cache from "./cache.js";
import vueLoader from "./loader.js";
import { Options } from "./types.js";

export default function (options?: Options): Plugin {
   return {
      name: "vue-plugin",
      extensions: [["script", ".vue"]],
      loaders: [vueLoader(options)],
      buildStart() {
         // Remove in cache if the assets doesn't exist anymore
         const configHash = this.getConfigHash();
         cache.forEach(configHash, (source) => {
            if (this.bundler.getAsset(source)) return;
            cache.remove(configHash, source);
         });
      },
      load(moduleInfo) {
         if (moduleInfo.type != "virtual") return;
         const cached = cache.get(this.getConfigHash(), moduleInfo.source);
         if (cached) {
            return cached;
         }
      },
      transform({ type, traverse }) {
         if (type != "script") return;
         const optionsAPI = options?.featureFlags?.__VUE_OPTIONS_API__;
         const prodDevtools = options?.featureFlags?.__VUE_PROD_DEVTOOLS__;
         traverse({
            Identifier(path) {
               if (path.node.name == "__VUE_OPTIONS_API__") {
                  if (optionsAPI === false) {
                     path.node.name = "false";
                  } else {
                     path.node.name = "true";
                  }
               }
               if (path.node.name == "__VUE_PROD_DEVTOOLS__") {
                  if (prodDevtools === true) {
                     path.node.name = "true";
                  } else {
                     path.node.name = "false";
                  }
               }
            },
         });
      },
   };
}
