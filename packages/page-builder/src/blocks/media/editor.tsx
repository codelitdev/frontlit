import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { MediaSettings } from "./settings";
import { isVideo } from "../../utils";
import {
  FieldGroup,
  ImageField,
  NumberField,
  SelectField,
  TextField,
  ToggleField,
} from "../_shared/fields";

export function MediaEditor({ settings, onChange }: WidgetEditorProps<MediaSettings>) {
  const update = (partial: Partial<MediaSettings>) =>
    onChange({ ...settings, ...partial });
  const isVideoContent = isVideo(settings.youtubeLink, settings.media);

  return (
    <div className="flex flex-col">
      <FieldGroup title="Media">
        <ImageField
          label="Image / poster"
          value={settings.media}
          onChange={(media) => update({ media })}
        />
        <TextField
          label="YouTube / Vimeo link"
          value={settings.youtubeLink}
          placeholder="https://youtube.com/watch?v=..."
          onChange={(youtubeLink) => update({ youtubeLink })}
        />
        {isVideoContent ? (
          <>
            <ToggleField
              label="Play video in a pop-up"
              value={settings.playVideoInModal}
              onChange={(playVideoInModal) => update({ playVideoInModal })}
            />
            <SelectField
              label="Aspect ratio"
              value={settings.aspectRatio ?? "16/9"}
              onChange={(aspectRatio) => update({ aspectRatio })}
              options={[
                { label: "Widescreen (16:9)", value: "16/9" },
                { label: "Standard (4:3)", value: "4/3" },
                { label: "Square (1:1)", value: "1/1" },
                { label: "Vertical (9:16)", value: "9/16" },
              ]}
            />
          </>
        ) : (
          <SelectField
            label="Object fit"
            value={settings.objectFit ?? "cover"}
            onChange={(objectFit) => update({ objectFit })}
            options={[
              { label: "Cover", value: "cover" },
              { label: "Contain", value: "contain" },
              { label: "Fill", value: "fill" },
              { label: "None", value: "none" },
              { label: "Scale down", value: "scale-down" },
            ]}
          />
        )}
      </FieldGroup>
      <FieldGroup title="Appearance">
        <NumberField
          label="Corner radius"
          value={settings.mediaRadius}
          min={0}
          max={8}
          onChange={(mediaRadius) => update({ mediaRadius })}
        />
        <ToggleField
          label="Border"
          value={settings.hasBorder}
          onChange={(hasBorder) => update({ hasBorder })}
        />
      </FieldGroup>
    </div>
  );
}
