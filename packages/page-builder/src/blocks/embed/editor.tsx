import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { EmbedSettings } from "./settings";
import { FieldGroup, NumberField, SelectField, TextField } from "../_shared/fields";

export function EmbedEditor({ settings, onChange }: WidgetEditorProps<EmbedSettings>) {
  const update = (partial: Partial<EmbedSettings>) =>
    onChange({ ...settings, ...partial });
  const contentType = settings.contentType ?? "url";
  const aspectRatio = settings.aspectRatio ?? "default";

  return (
    <div className="flex flex-col">
      <div className="mx-1 mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        Embedding external content may expose visitors to scripts and trackers you
        don&apos;t control. Only embed sources you trust.
      </div>
      <FieldGroup title="Content">
        <SelectField
          label="Type"
          value={contentType}
          onChange={(value) => update({ contentType: value })}
          options={[
            { label: "URL", value: "url" },
            { label: "Script / iframe snippet", value: "script" },
          ]}
        />
        {contentType === "url" ? (
          <TextField
            label="URL"
            value={settings.content}
            placeholder="https://..."
            onChange={(content) => update({ content })}
          />
        ) : (
          <TextField
            label="Snippet"
            multiline
            value={settings.content}
            placeholder="<script>...</script> or <iframe>...</iframe>"
            onChange={(content) => update({ content })}
          />
        )}
      </FieldGroup>
      <FieldGroup title="Sizing">
        <SelectField
          label="Aspect ratio"
          value={aspectRatio}
          onChange={(value) => update({ aspectRatio: value })}
          options={[
            { label: "Default (fixed height)", value: "default" },
            { label: "Widescreen (16:9)", value: "16:9" },
            { label: "Standard (4:3)", value: "4:3" },
            { label: "Square (1:1)", value: "1:1" },
          ]}
        />
        {aspectRatio === "default" && (
          <NumberField
            label="Height (px)"
            value={settings.height}
            min={100}
            max={2000}
            onChange={(height) => update({ height })}
          />
        )}
      </FieldGroup>
    </div>
  );
}
