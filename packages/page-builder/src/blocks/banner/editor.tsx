import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { BannerSettings } from "./settings";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import { FieldGroup, SelectField, TextField } from "../_shared/fields";

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
          value={settings.title}
          onChange={(title) => update({ title })}
        />
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Description</span>
          <Editor
            initialContent={settings.description ?? emptyDoc}
            onChange={(description: any) => update({ description })}
            showToolbar={false}
            editorClassName="min-h-[80px]"
          />
        </div>
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
