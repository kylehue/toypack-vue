import { Plugin } from "toypack/types";
import {
   parse,
   compileScript,
   compileTemplate,
   compileStyle,
   SFCStyleCompileResults,
} from "@vue/compiler-sfc";
import { getHash } from "toypack/utils";
import { Options } from "./types.js";

export default function (options?: Options): Plugin {
   return {
      name: "vue-plugin",
      extensions: [["script", ".vue"]],
      buildStart() {
         // Remove in cache if the assets doesn't exist anymore
         this.cache.forEach((value, source) => {
            if (this.bundler.getAsset(source)) return;
            this.cache.delete(source);
         });
      },
      load(moduleInfo) {
         const cached = this.cache.get(moduleInfo.source);
         if (cached) {
            return cached;
         }

         if (!/\.vue$/.test(moduleInfo.source.split("?")[0])) return;

         if (typeof moduleInfo.content != "string") {
            this.emitError("Blob contents are not supported.");
            return;
         }

         const bundlerConfig = this.bundler.config;

         const { errors, descriptor } = parse(moduleInfo.content, {
            filename: moduleInfo.source,
            sourceMap: this.shouldMap(),
         });

         if (errors.length) {
            this.emitError(errors[0].message);
            return;
         }

         const scopeId = "data-v-" + getHash(moduleInfo.source);

         const compiledScript = compileScript(descriptor, {
            id: scopeId,
            inlineTemplate: false,
            reactivityTransform: false,
            isProd: bundlerConfig.bundle.mode == "production",
            babelParserPlugins: bundlerConfig.parser.plugins ?? [],
            sourceMap: this.shouldMap(),
            fs: {
               fileExists: (file) => {
                  return !!this.bundler.getAsset(file);
               },
               readFile: (file) => {
                  const asset = this.bundler.getAsset(file);
                  if (asset?.type == "text") {
                     return asset.content;
                  }
               },
            },
         });

         if (compiledScript.warnings?.length) {
            for (const warn of compiledScript.warnings) {
               this.emitWarning(warn);
            }
         }

         const virtualScriptId = `virtual:${moduleInfo.source}.${
            compiledScript.lang || "js"
         }?script`;
         this.cache.set(virtualScriptId, {
            type: "script",
            content: compiledScript.content,
            map: compiledScript.map,
         });

         if (compiledScript.map) {
            compiledScript.map.sources = [
               `virtual:${moduleInfo.source}?script`,
            ];
         }

         const compiledTemplate = compileTemplate({
            id: scopeId,
            filename: descriptor.filename,
            source: descriptor.template?.content ?? "",
            isProd: bundlerConfig.bundle.mode == "production",
            slotted: descriptor.slotted,
            scoped: descriptor.styles.some((s) => s.scoped),
            compilerOptions: {
               ...options?.compilerOptions,
               scopeId,
               prefixIdentifiers: true,
               bindingMetadata: compiledScript.bindings,
               onError: (error) => {
                  this.emitError(error.message);
               },
               onWarn: (warning) => {
                  this.emitWarning(warning.message);
               },
            },
            compiler: options?.compiler,
         });

         if (compiledTemplate.errors.length) {
            const error = compiledTemplate.errors[0];
            this.emitError(typeof error == "string" ? error : error.message);
            return;
         }

         const virtualTemplateId = `virtual:${moduleInfo.source}?template`;
         this.cache.set(virtualTemplateId, {
            type: "script",
            content: compiledTemplate.code,
            map: compiledTemplate.map,
         });

         if (compiledTemplate.map) {
            compiledTemplate.map.sources = [virtualTemplateId];
         }

         const compiledStyles: Record<string, SFCStyleCompileResults[]> = {};
         const externalStyleImports: string[] = [];
         const styleImports: string[] = [];
         for (const style of descriptor.styles) {
            if (style.src) {
               externalStyleImports.push(this.getImportCode(style.src));
               continue;
            }

            if (style.module) {
               this.emitError("<style module> is currently not supported.");
            }

            if (!style.content.trim()) continue;
            const compiledStyle = compileStyle({
               id: scopeId,
               filename: moduleInfo.source,
               source: style.content,
               scoped: style.scoped,
            });

            if (compiledStyle.errors.length) {
               for (const error of compiledStyle.errors) {
                  this.emitError(error.message);
               }
               return;
            }

            const index = descriptor.styles.indexOf(style);
            const virtualStyleId = `virtual:${moduleInfo.source}.${
               style.lang || "css"
            }?style&index=${index}`;
            this.cache.set(virtualStyleId, {
               type: "style",
               content: compiledStyle.code,
               map: compiledStyle.map,
            });

            if (compiledStyle.map) {
               compiledStyle.map.sources = [
                  `virtual:${moduleInfo.source}?style&index=${index}`,
               ];
            }

            styleImports.push(this.getImportCode(virtualStyleId));
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            compiledStyles[style.lang ?? "css"] ??= [];
            compiledStyles[style.lang ?? "css"].push(compiledStyle);
         }

         const mainContent = `
${this.getImportCode(virtualScriptId, [{ name: "script", isDefault: true }])}
${this.getImportCode(virtualTemplateId, ["render"])}
${styleImports.join("\n")}
${externalStyleImports.join("\n")}
script.render = render;
script.__file = "${moduleInfo.source}";
script.__scopeId = "${scopeId}";
export default script;
`;

         return {
            type: "script",
            content: mainContent,
         };
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
