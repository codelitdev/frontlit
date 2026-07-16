import type {
    HorizontalAlignment,
    TextEditorContent,
    WidgetDefaultSettings,
} from "../../models";

export interface RichTextSettings extends WidgetDefaultSettings {
    text?: TextEditorContent;
    alignment?: HorizontalAlignment;
}
