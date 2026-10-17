import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { CodeSnippetSettings } from "./settings";
import { FieldGroup, SelectField, TextField, ToggleField } from "../_shared/fields";

export function CodeSnippetEditor({
  settings,
  onChange,
}: WidgetEditorProps<CodeSnippetSettings>) {
  const update = (partial: Partial<CodeSnippetSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Content">
        <TextField
          label="Code"
          value={settings.code}
          placeholder="curl -fsSL https://example.com/install.sh | sh"
          multiline
          onChange={(code) => update({ code })}
        />
        <ToggleField
          label="Show $ prompt"
          value={settings.showPrompt ?? true}
          onChange={(showPrompt) => update({ showPrompt })}
        />
        <TextField
          label="Caption"
          value={settings.caption}
          placeholder="e.g. macOS · Linux · Windows"
          onChange={(caption) => update({ caption })}
        />
      </FieldGroup>
      <FieldGroup title="Layout">
        <SelectField
          label="Alignment"
          value={settings.contentAlignment ?? "center"}
          onChange={(contentAlignment) => update({ contentAlignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ]}
        />
      </FieldGroup>
    </div>
  );
}
