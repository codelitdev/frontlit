import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { FooterColumn, FooterLink, FooterSettings } from "./settings";
import { generateUniqueId } from "../../utils";
import { FieldGroup, ListField, TextField } from "../_shared/fields";

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
                    label="Logo text"
                    value={settings.logoText}
                    onChange={(logoText) => update({ logoText })}
                />
                <TextField
                    label="Tagline"
                    value={settings.tagline}
                    multiline
                    onChange={(tagline) => update({ tagline })}
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
                                            onChange={(label) =>
                                                updateLink({ label })
                                            }
                                        />
                                        <TextField
                                            label="Link"
                                            value={link.href}
                                            onChange={(href) =>
                                                updateLink({ href })
                                            }
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
            </FieldGroup>
        </div>
    );
}
