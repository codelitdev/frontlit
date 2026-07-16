import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { FaqItem, FaqSettings } from "./settings";
import { generateUniqueId } from "../../utils";
import { FieldGroup, ListField, SelectField, TextField } from "../_shared/fields";

export function FaqEditor({
    settings,
    onChange,
}: WidgetEditorProps<FaqSettings>) {
    const update = (partial: Partial<FaqSettings>) =>
        onChange({ ...settings, ...partial });

    return (
        <div className="flex flex-col">
            <FieldGroup title="Header">
                <TextField
                    label="Title"
                    value={settings.title}
                    onChange={(title) => update({ title })}
                />
                <SelectField
                    label="Header alignment"
                    value={settings.headerAlignment ?? "left"}
                    onChange={(headerAlignment) => update({ headerAlignment })}
                    options={[
                        { label: "Left", value: "left" },
                        { label: "Center", value: "center" },
                    ]}
                />
            </FieldGroup>
            <FieldGroup title="Questions">
                <ListField<FaqItem>
                    label="Items"
                    items={settings.items ?? []}
                    onChange={(items) => update({ items })}
                    createItem={() => ({
                        id: generateUniqueId(),
                        question: "New question",
                        answer: "",
                    })}
                    addLabel="Add question"
                    renderItem={(item, updateItem, remove) => (
                        <>
                            <TextField
                                label="Question"
                                value={item.question}
                                onChange={(question) =>
                                    updateItem({ question })
                                }
                            />
                            <TextField
                                label="Answer"
                                value={item.answer}
                                multiline
                                onChange={(answer) => updateItem({ answer })}
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
