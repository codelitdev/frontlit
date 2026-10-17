import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { FooterColumn, FooterLink, FooterSettings } from "./settings";
import { generateUniqueId } from "../../utils";
import { FieldGroup, ListField, TextField, ToggleField } from "../_shared/fields";

export function FooterEditor({
  settings,
  onChange,
}: WidgetEditorProps<FooterSettings>) {
  const update = (partial: Partial<FooterSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Brand">
        <TextField
          label="Tagline"
          value={settings.tagline}
          multiline
          hint="Leave empty to use the subtitle from Branding."
          onChange={(tagline) => update({ tagline: tagline || undefined })}
        />
      </FieldGroup>
      <FieldGroup title="Link columns">
        <ListField<FooterColumn>
          label="Columns"
          items={settings.columns ?? []}
          onChange={(columns) => update({ columns })}
          createItem={() => ({
            id: generateUniqueId(),
            title: "New column",
            links: [],
          })}
          addLabel="Add column"
          renderItem={(column, updateColumn, removeColumn) => (
            <>
              <TextField
                label="Column title"
                value={column.title}
                onChange={(title) => updateColumn({ title })}
              />
              <ListField<FooterLink>
                label="Links"
                items={column.links}
                onChange={(links) => updateColumn({ links })}
                createItem={() => ({
                  id: generateUniqueId(),
                  label: "New link",
                  href: "#",
                })}
                addLabel="Add link"
                renderItem={(link, updateLink, removeLink) => (
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
                    <button
                      type="button"
                      className="self-start text-xs text-destructive"
                      onClick={removeLink}
                    >
                      Remove link
                    </button>
                  </>
                )}
              />
              <button
                type="button"
                className="self-start text-xs text-destructive"
                onClick={removeColumn}
              >
                Remove column
              </button>
            </>
          )}
        />
      </FieldGroup>
      <FieldGroup title="Copyright">
        <TextField
          label="Copyright text"
          value={settings.copyrightText}
          onChange={(copyrightText) => update({ copyrightText })}
        />
        <ToggleField
          label="Color mode switcher"
          value={settings.showThemeSwitcher !== false}
          onChange={(showThemeSwitcher) => update({ showThemeSwitcher })}
        />
      </FieldGroup>
    </div>
  );
}
