import type { Widget } from "../../models";
import { codeSnippetMetadata } from "./metadata";
import { CodeSnippetWidget } from "./widget";
import { CodeSnippetEditor } from "./editor";
import { codeSnippetDefaults } from "./defaults";
import type { CodeSnippetSettings } from "./settings";

export * from "./settings";

export const CodeSnippetBlock: Widget<CodeSnippetSettings> = {
  metadata: codeSnippetMetadata,
  widget: CodeSnippetWidget,
  editor: CodeSnippetEditor,
  getDefaultSettings: () => codeSnippetDefaults,
};
