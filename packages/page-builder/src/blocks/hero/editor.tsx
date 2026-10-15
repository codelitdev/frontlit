import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { HeroSettings } from "./settings";
import {
  FieldGroup,
  ImageField,
  RichTextField,
  SelectField,
  TextField,
} from "../_shared/fields";

export function HeroEditor({ settings, onChange }: WidgetEditorProps<HeroSettings>) {
  const update = (partial: Partial<HeroSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Content">
        <TextField
          label="Eyebrow"
          value={settings.preTitle}
          placeholder="e.g. Careers"
          onChange={(preTitle) => update({ preTitle })}
        />
        <TextField
          label="Title"
          value={settings.title}
          onChange={(title) => update({ title })}
        />
        <RichTextField
          label="Description"
          value={settings.description}
          onChange={(description) => update({ description })}
          showToolbar={false}
          minHeight={100}
        />
      </FieldGroup>
      <FieldGroup title="Media">
        <ImageField
          label="Image"
          value={settings.media}
          onChange={(media) => update({ media })}
        />
        <TextField
          label="YouTube / Vimeo link"
          value={settings.youtubeLink}
          placeholder="https://youtube.com/watch?v=..."
          onChange={(youtubeLink) => update({ youtubeLink })}
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
        <TextField
          label="Small print"
          value={settings.smallPrint}
          placeholder="e.g. No credit card required"
          onChange={(smallPrint) => update({ smallPrint })}
        />
      </FieldGroup>
      <FieldGroup title="Layout">
        <SelectField
          label="Media position"
          value={settings.alignment ?? "right"}
          onChange={(alignment) => update({ alignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Right", value: "right" },
          ]}
        />
        <SelectField
          label="Content alignment"
          value={settings.contentAlignment ?? "left"}
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
