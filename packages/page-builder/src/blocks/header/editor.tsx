import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { HeaderNavLink, HeaderSettings } from "./settings";
import { generateUniqueId } from "../../utils";
import {
  FieldGroup,
  ListField,
  SelectField,
  SliderField,
  TextField,
  ToggleField,
} from "../_shared/fields";

const CORNER_LABELS: Record<number, string> = {
  0: "Square",
  1: "Small",
  2: "Default",
  3: "Medium",
  4: "Large",
  5: "XL",
  6: "2XL",
  7: "3XL",
  8: "Full",
};

export function HeaderEditor({
  settings,
  onChange,
}: WidgetEditorProps<HeaderSettings>) {
  const update = (partial: Partial<HeaderSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Navigation links">
        <ListField<HeaderNavLink>
          label="Links"
          items={settings.links ?? []}
          onChange={(links) => update({ links })}
          createItem={() => ({
            id: generateUniqueId(),
            label: "New link",
            href: "#",
          })}
          addLabel="Add link"
          renderItem={(link, updateLink, remove) => (
            <>
              <TextField
                label="Label"
                value={link.label}
                onChange={(label) => updateLink({ label })}
              />
              <TextField
                label="Link"
                value={link.href}
                onChange={(href) => updateLink({ href })}
              />
              <ToggleField
                label="Show as button"
                value={link.isButton}
                onChange={(isButton) => updateLink({ isButton })}
              />
              <button
                type="button"
                className="self-start text-xs text-destructive"
                onClick={remove}
              >
                Remove
              </button>
            </>
          )}
        />
      </FieldGroup>
      <FieldGroup title="Call to action">
        <TextField
          label="Button text"
          value={settings.ctaLabel}
          onChange={(ctaLabel) => update({ ctaLabel })}
        />
        <TextField
          label="Button link"
          value={settings.ctaHref}
          onChange={(ctaHref) => update({ ctaHref })}
        />
      </FieldGroup>
      <FieldGroup title="GitHub">
        <TextField
          label="Repository"
          value={settings.githubRepo}
          placeholder="owner/repo"
          hint="Shows a GitHub icon linking to the repository."
          onChange={(githubRepo) => update({ githubRepo })}
        />
        {settings.githubRepo && (
          <ToggleField
            label="Show star count"
            value={settings.showGithubStars}
            onChange={(showGithubStars) => update({ showGithubStars })}
          />
        )}
      </FieldGroup>
      <FieldGroup title="Layout">
        <SelectField
          label="Link alignment"
          value={settings.linkAlignment ?? "left"}
          onChange={(linkAlignment) => update({ linkAlignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ]}
        />
        <ToggleField
          label="Backdrop blur"
          value={settings.backdropBlur}
          onChange={(backdropBlur) => update({ backdropBlur })}
        />
      </FieldGroup>
    </div>
  );
}

export function HeaderDesignEditor({
  settings,
  onChange,
}: WidgetEditorProps<HeaderSettings>) {
  const update = (partial: Partial<HeaderSettings>) =>
    onChange({ ...settings, ...partial });

  const logoCorners = settings.logoCorners ?? 2;

  return (
    <div className="flex flex-col">
      <FieldGroup title="Logo styling">
        <SliderField
          label="Logo corners"
          value={logoCorners}
          min={0}
          max={8}
          step={1}
          minLabel="0 (Square)"
          maxLabel="Full"
          displayValue={CORNER_LABELS[logoCorners] ?? `${logoCorners}`}
          onChange={(val) => update({ logoCorners: val })}
        />
      </FieldGroup>
    </div>
  );
}
