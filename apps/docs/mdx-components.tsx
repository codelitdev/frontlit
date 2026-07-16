import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { PageBuilderDemo } from "@/components/page-builder-demo";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
    return {
        ...defaultMdxComponents,
        PageBuilderDemo,
        ...components,
    };
}
