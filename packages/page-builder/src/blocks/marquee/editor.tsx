import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { MarqueeItem, MarqueeSettings } from "./settings";
import { generateUniqueId } from "../../utils";
import {
    FieldGroup,
    ListField,
    NumberField,
    SelectField,
    TextField,
    ToggleField,
} from "../_shared/fields";

export function MarqueeEditor({
    settings,
    onChange,
}: WidgetEditorProps<MarqueeSettings>) {
    const update = (partial: Partial<MarqueeSettings>) =>
        onChange({ ...settings, ...partial });

    return (
        <div className="flex flex-col">
            <FieldGroup title="Items">
                <ListField<MarqueeItem>
                    label="Items"
                    items={settings.items ?? []}
                    onChange={(items) => update({ items })}
                    createItem={() => ({
                        id: generateUniqueId(),
                        text: "New item",
                    })}
                    addLabel="Add item"
                    renderItem={(item, updateItem, remove) => (
                        <>
                            <TextField
                                label="Text"
                                value={item.text}
                                onChange={(text) => updateItem({ text })}
                            />
                            <TextField
                                label="Icon (lucide-react name)"
                                value={item.icon}
                                placeholder="e.g. Globe — overrides text"
                                onChange={(icon) => updateItem({ icon })}
                            />
                            <TextField
                                label="Link (optional)"
                                value={item.href}
                                placeholder="https://..."
                                onChange={(href) => updateItem({ href })}
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
            <FieldGroup title="Scroll">
                <SelectField
                    label="Direction"
                    value={settings.direction ?? "right"}
                    onChange={(direction) => update({ direction })}
                    options={[
                        { label: "Right to left", value: "right" },
                        { label: "Left to right", value: "left" },
                    ]}
                />
                <NumberField
                    label="Speed (px/sec)"
                    value={settings.speed}
                    min={10}
                    max={200}
                    onChange={(speed) => update({ speed })}
                />
                <ToggleField
                    label="Pause on hover"
                    value={settings.pauseOnHover}
                    onChange={(pauseOnHover) => update({ pauseOnHover })}
                />
                <NumberField
                    label="Edge fade width (px)"
                    value={settings.fadeWidth}
                    min={0}
                    max={200}
                    onChange={(fadeWidth) => update({ fadeWidth })}
                />
            </FieldGroup>
            <FieldGroup title="Item style">
                <TextField
                    label="Background color"
                    value={settings.itemBackgroundColor}
                    placeholder="#ffffff"
                    onChange={(itemBackgroundColor) =>
                        update({ itemBackgroundColor })
                    }
                />
                <TextField
                    label="Foreground color"
                    value={settings.itemForegroundColor}
                    placeholder="#000000"
                    onChange={(itemForegroundColor) =>
                        update({ itemForegroundColor })
                    }
                />
                <TextField
                    label="Border color"
                    value={settings.itemBorderColor}
                    placeholder="#e2e8f0"
                    onChange={(itemBorderColor) => update({ itemBorderColor })}
                />
                <SelectField
                    label="Border style"
                    value={settings.itemBorderStyle ?? "solid"}
                    onChange={(itemBorderStyle) => update({ itemBorderStyle })}
                    options={[
                        { label: "Solid", value: "solid" },
                        { label: "Dashed", value: "dashed" },
                        { label: "Dotted", value: "dotted" },
                        { label: "Double", value: "double" },
                        { label: "None", value: "none" },
                    ]}
                />
                <NumberField
                    label="Border width"
                    value={settings.itemBorderWidth}
                    min={0}
                    max={10}
                    onChange={(itemBorderWidth) => update({ itemBorderWidth })}
                />
                <NumberField
                    label="Border radius"
                    value={settings.itemBorderRadius}
                    min={0}
                    max={50}
                    onChange={(itemBorderRadius) =>
                        update({ itemBorderRadius })
                    }
                />
            </FieldGroup>
        </div>
    );
}
