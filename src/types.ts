import { CompilerOptions, TemplateCompiler } from "@vue/compiler-sfc";

export type VirtualModules = Record<
   string,
   {
      lang: string;
      type: "script" | "style";
      content: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map: any;
   }
>;

export interface Options {
   compiler?: TemplateCompiler;
   compilerOptions?: CompilerOptions;
}