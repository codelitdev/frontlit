import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { RichTextSettings } from "./settings";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import { FieldGroup, SelectField } from "../_shared/fields";

export function RichTextEditor({
  settings,
  onChange,
}: WidgetEditorProps<RichTextSettings>) {
  const update = (partial: Partial<RichTextSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Content">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Text</span>
          <Editor
            initialContent={settings.text ?? emptyDoc}
            onChange={(text: any) => update({ text })}
            editorClassName="min-h-[160px]"
          />
        </div>
        <SelectField
          label="Alignment"
          value={settings.alignment ?? "left"}
          onChange={(alignment) => update({ alignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ]}
        />
      </FieldGroup>
    </div>
  );
}
