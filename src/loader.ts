import {
   parse,
   compileScript,
   compileTemplate,
   compileStyle,
   SFCStyleCompileResults,
} from "@vue/compiler-sfc";
import { Loader } from "toypack/types";
import { getHash } from "toypack/utils";
import * as cache from "./cache.js";
import { Options, VirtualModules } from "./types.js";

export default function (options?: Options): Loader {
   return {
      test: /\.vue$/,
      compile(moduleInfo) {
         if (typeof moduleInfo.content != "string") {
            this.error("Blob contents are not supported.");
            return;
         }

         const bundlerConfig = this.bundler.getConfig();

         const { errors, descriptor } = parse(moduleInfo.content, {
            filename: moduleInfo.source,
            sourceMap: this.shouldMap(),
         });

         if (errors.length) {
            this.error(errors[0].message);
            return;
         }

         const scopeId = "data-v-" + getHash(moduleInfo.source);
         const virtualModules: VirtualModules = {};

         const compiledScript = compileScript(descriptor, {
            id: scopeId,
            inlineTemplate: false,
            reactivityTransform: false,
            isProd: bundlerConfig.bundle.mode == "production",
            babelParserPlugins: bundlerConfig.babel.parse.plugins ?? [],
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
               this.warn(warn);
            }
         }

         const virtualScriptId = `virtual:${moduleInfo.source}?script`;
         virtualModules[virtualScriptId] = {
            type: "script",
            content: compiledScript.content,
            map: compiledScript.map,
            lang: compiledScript.lang ?? "js",
         };

         if (compiledScript.map) {
            compiledScript.map.sources = [virtualScriptId];
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
                  this.error(error.message);
               },
               onWarn: (warning) => {
                  this.warn(warning.message);
               },
            },
            compiler: options?.compiler,
         });

         if (compiledTemplate.errors.length) {
            const error = compiledTemplate.errors[0];
            this.error(typeof error == "string" ? error : error.message);
            return;
         }

         const virtualTemplateId = `virtual:${moduleInfo.source}?template`;
         virtualModules[virtualTemplateId] = {
            type: "script",
            content: compiledTemplate.code,
            map: compiledTemplate.map,
            lang: "js",
         };

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
               this.error("<style module> is currently not supported.");
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
                  this.error(error.message);
               }
               return;
            }

            const index = descriptor.styles.indexOf(style);
            const virtualStyleId = `virtual:${moduleInfo.source}?style&index=${index}`;
            virtualModules[virtualStyleId] = {
               type: "style",
               content: compiledStyle.code,
               map: compiledStyle.map,
               lang: style.lang ?? "css",
            };

            if (compiledStyle.map) {
               compiledStyle.map.sources = [virtualTemplateId];
            }

            styleImports.push(this.getImportCode(virtualStyleId));
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            compiledStyles[style.lang ?? "css"] ??= [];
            compiledStyles[style.lang ?? "css"].push(compiledStyle);
         }

         cache.set(this.getConfigHash(), moduleInfo.source, virtualModules);

         return `
${this.getImportCode(virtualScriptId, [{ name: "script", isDefault: true }])}
${this.getImportCode(virtualTemplateId, ["render"])}
${styleImports.join("\n")}
${externalStyleImports.join("\n")}
script.render = render;
script.__file = "${moduleInfo.source}";
script.__scopeId = "${scopeId}";
export default script;
`;
      },
   };
}
