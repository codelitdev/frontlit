import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { BannerSettings } from "./settings";
import {
  FieldGroup,
  RichTextField,
  SelectField,
  TextField,
  TitleLevelField,
} from "../_shared/fields";

export function BannerEditor({
  settings,
  onChange,
}: WidgetEditorProps<BannerSettings>) {
  const update = (partial: Partial<BannerSettings>) =>
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
      <FieldGroup title="Calls to action">
        <TextField
          label="Primary button text"
          value={settings.buttonCaption}
          onChange={(buttonCaption) => update({ buttonCaption })}
        />
        <TextField
          label="Primary button link"
          value={settings.buttonAction}
          onChange={(buttonAction) => update({ buttonAction })}
        />
        <TextField
          label="Secondary button text"
          value={settings.secondaryButtonCaption}
          onChange={(secondaryButtonCaption) => update({ secondaryButtonCaption })}
        />
        <TextField
          label="Secondary button link"
          value={settings.secondaryButtonAction}
          onChange={(secondaryButtonAction) => update({ secondaryButtonAction })}
        />
      </FieldGroup>
      <FieldGroup title="Layout">
        <SelectField
          label="Content alignment"
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
