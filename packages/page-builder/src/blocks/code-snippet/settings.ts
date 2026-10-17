import type { Alignment, WidgetDefaultSettings } from "../../models";

export interface CodeSnippetSettings extends WidgetDefaultSettings {
  /** The command or code to show and copy. */
  code?: string;
  /** Show a "$" prompt before the first line. */
  showPrompt?: boolean;
  /** Small line under the snippet, e.g. "macOS · Linux · Windows". */
  caption?: string;
  contentAlignment?: Alignment;
}
