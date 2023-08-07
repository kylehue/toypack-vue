import { Plugin } from "toypack/types";
import vueLoader from "./loader.js";
import { Options } from "./types.js";

export default function (options?: Options): Plugin {
   return {
      name: "vue-plugin",
      extensions: [["script", ".vue"]],
      loaders: [vueLoader(options)],
      buildStart() {
         // Remove in cache if the assets doesn't exist anymore
         this.eachCache((value, source) => {
            if (this.bundler.getAsset(source)) return;
            this.removeCache(source);
         });
      },
      load(moduleInfo) {
         if (moduleInfo.type != "virtual") return;
         const cached = this.getCache(moduleInfo.source);
         if (cached) {
            return cached;
         }
      },
      transform() {
         const optionsAPI = options?.featureFlags?.__VUE_OPTIONS_API__;
         const prodDevtools = options?.featureFlags?.__VUE_PROD_DEVTOOLS__;
         if (
            typeof optionsAPI !== "boolean" &&
            typeof prodDevtools !== "boolean"
         ) {
            return;
         }

         return {
            Identifier(path) {
               const { scope, node, parentPath } = path;
               if (
                  node.name !== "__VUE_OPTIONS_API__" &&
                  node.name !== "__VUE_PROD_DEVTOOLS__"
               ) {
                  return;
               }
               const isGlobal = !scope.getBinding(node.name);
               if (!isGlobal) return;
               if (parentPath.isMemberExpression()) return;
               if (
                  parentPath.isObjectProperty() &&
                  parentPath.node.key === node
               ) {
                  return;
               }
               path.replaceWith({
                  type: "BooleanLiteral",
                  value:
                     node.name === "__VUE_OPTIONS_API__"
                        ? !!optionsAPI
                        : !!prodDevtools,
               });
            },
         };
      },
   };
}
