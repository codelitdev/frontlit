import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { PageBuilderDemo } from "@/components/page-builder-demo";
import { TextEditorDemo } from "@/components/text-editor-demo";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    PageBuilderDemo,
    TextEditorDemo,
    ...components,
  };
}
