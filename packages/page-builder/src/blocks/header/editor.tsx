import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { HeaderNavLink, HeaderSettings } from "./settings";
import { generateUniqueId } from "../../utils";
import {
    FieldGroup,
    ListField,
    SelectField,
    TextField,
    ToggleField,
} from "../_shared/fields";

export function HeaderEditor({
    settings,
    onChange,
}: WidgetEditorProps<HeaderSettings>) {
    const update = (partial: Partial<HeaderSettings>) =>
        onChange({ ...settings, ...partial });

    return (
        <div className="flex flex-col">
            <FieldGroup title="Logo">
                <TextField
                    label="Logo text"
                    value={settings.logoText}
                    onChange={(logoText) => update({ logoText })}
                />
                <TextField
                    label="Logo image URL"
                    value={settings.logoImage}
                    placeholder="https://..."
                    onChange={(logoImage) => update({ logoImage })}
                />
            </FieldGroup>
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
                                onChange={(isButton) =>
                                    updateLink({ isButton })
                                }
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
                <ToggleField
                    label="Color mode switcher"
                    value={settings.showThemeSwitcher !== false}
                    onChange={(showThemeSwitcher) =>
                        update({ showThemeSwitcher })
                    }
                />
            </FieldGroup>
        </div>
    );
}
