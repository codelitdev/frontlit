import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { ContentSettings } from "./settings";
import {
  FieldGroup,
  ImageField,
  NumberField,
  SelectField,
  TextField,
  RichTextField,
  TitleLevelField,
} from "../_shared/fields";

export function ContentEditor({
  settings,
  onChange,
}: WidgetEditorProps<ContentSettings>) {
  const update = (partial: Partial<ContentSettings>) =>
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
          label="Body"
          value={settings.body}
          onChange={(body) => update({ body })}
          minHeight={160}
        />
      </FieldGroup>
      <FieldGroup title="Media">
        <ImageField
          label="Image"
          value={settings.media}
          onChange={(media) => update({ media })}
        />
        <NumberField
          label="Image corner radius"
          value={settings.mediaRadius}
          min={0}
          max={8}
          onChange={(mediaRadius) => update({ mediaRadius })}
        />
      </FieldGroup>
      <FieldGroup title="Layout">
        <SelectField
          label="Media position"
          value={settings.alignment ?? "left"}
          onChange={(alignment) => update({ alignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Right", value: "right" },
          ]}
        />
        <SelectField
          label="Header alignment"
          value={settings.headerAlignment ?? "left"}
          onChange={(headerAlignment) => update({ headerAlignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ]}
        />
      </FieldGroup>
    </div>
  );
}
