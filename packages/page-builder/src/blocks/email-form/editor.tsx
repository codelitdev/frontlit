import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { EmailFormSettings } from "./settings";
import {
  FieldGroup,
  RichTextField,
  SelectField,
  TextField,
  TitleLevelField,
} from "../_shared/fields";

export function EmailFormEditor({
  settings,
  onChange,
}: WidgetEditorProps<EmailFormSettings>) {
  const update = (partial: Partial<EmailFormSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Content">
        <TextField
          label="Title"
          hint="Wrap words in *asterisks* to highlight them."
          value={settings.title}
          onChange={(title) => update({ title })}
        />
        <TitleLevelField settings={settings} onChange={update} />
        <RichTextField
          label="Description"
          value={settings.description}
          onChange={(description) => update({ description })}
          showToolbar={false}
          minHeight={80}
        />
      </FieldGroup>
      <FieldGroup title="Form">
        <TextField
          label="Button text"
          value={settings.buttonCaption}
          onChange={(buttonCaption) => update({ buttonCaption })}
        />
        <TextField
          label="Success message"
          value={settings.successMessage}
          onChange={(successMessage) => update({ successMessage })}
        />
      </FieldGroup>
      <FieldGroup title="Layout">
        <SelectField
          label="Alignment"
          value={settings.alignment ?? "left"}
          onChange={(alignment) => update({ alignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ]}
        />
      </FieldGroup>
    </div>
  );
}
