import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { GridItem, GridSettings } from "./settings";
import {
  FieldGroup,
  ImageField,
  ListField,
  NumberField,
  SelectField,
  TextField,
  RichTextField,
} from "../_shared/fields";

export function GridEditor({ settings, onChange }: WidgetEditorProps<GridSettings>) {
  const update = (partial: Partial<GridSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col">
      <FieldGroup title="Header">
        <TextField
          label="Title"
          value={settings.title}
          onChange={(title) => update({ title })}
        />
        <RichTextField
          label="Description"
          value={settings.description}
          onChange={(description) => update({ description })}
          minHeight={100}
        />
        <SelectField
          label="Header alignment"
          value={settings.headerAlignment ?? "center"}
          onChange={(headerAlignment) => update({ headerAlignment })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ]}
        />
      </FieldGroup>
      <FieldGroup title="Call to action">
        <TextField
          label="Button text"
          value={settings.buttonCaption}
          onChange={(buttonCaption) => update({ buttonCaption })}
        />
        <TextField
          label="Button link"
          value={settings.buttonAction}
          placeholder="https://..."
          onChange={(buttonAction) => update({ buttonAction })}
        />
      </FieldGroup>
      <FieldGroup title="Items">
        <NumberField
          label="Columns"
          value={settings.columns ?? 3}
          min={2}
          max={3}
          onChange={(columns) => update({ columns: columns as 2 | 3 })}
        />
        <ListField<GridItem>
          label="Cards"
          items={settings.items ?? []}
          onChange={(items) => update({ items })}
          createItem={() => ({
            title: "New item",
            mediaAlignment: "top",
          })}
          addLabel="Add card"
          renderItem={(item, updateItem, remove) => (
            <>
              <TextField
                label="Title"
                value={item.title}
                onChange={(title) => updateItem({ title })}
              />
              <TextField
                label="Description"
                value={item.description}
                multiline
                onChange={(description) => updateItem({ description })}
              />
              <TextField
                label="Icon (lucide-react name)"
                value={item.icon}
                placeholder="e.g. Globe"
                onChange={(icon) => updateItem({ icon })}
              />
              <ImageField
                label="Image (overrides icon)"
                value={item.media}
                onChange={(media) => updateItem({ media })}
              />
              <SelectField
                label="Image position"
                value={item.mediaAlignment ?? "top"}
                onChange={(mediaAlignment) => updateItem({ mediaAlignment })}
                options={[
                  { label: "Above title", value: "top" },
                  { label: "Below content", value: "bottom" },
                  {
                    label: "Overlay (title over image)",
                    value: "overlay",
                  },
                ]}
              />
              <TextField
                label="Button text"
                value={item.buttonCaption}
                onChange={(buttonCaption) => updateItem({ buttonCaption })}
              />
              <TextField
                label="Button link"
                value={item.buttonAction}
                placeholder="https://..."
                onChange={(buttonAction) => updateItem({ buttonAction })}
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
    </div>
  );
}
