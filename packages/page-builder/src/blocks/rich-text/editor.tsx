import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { RichTextSettings } from "./settings";
import { FieldGroup, RichTextField, SelectField } from "../_shared/fields";

export function RichTextEditor({
  settings,
  onChange,
}: WidgetEditorProps<RichTextSettings>) {
  const update = (partial: Partial<RichTextSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Content">
        <RichTextField
          label="Text"
          value={settings.text}
          onChange={(text) => update({ text })}
          minHeight={160}
        />
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
