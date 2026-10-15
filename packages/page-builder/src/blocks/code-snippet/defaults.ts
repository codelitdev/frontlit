import type { CodeSnippetSettings } from "./settings";

export const codeSnippetDefaults: Partial<CodeSnippetSettings> = {
  code: "curl -fsSL https://example.com/install.sh | sh",
  showPrompt: true,
  contentAlignment: "center",
};
