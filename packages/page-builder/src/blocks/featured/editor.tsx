import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { FeatureItem, FeaturedSettings } from "./settings";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import {
    FieldGroup,
    ListField,
    SelectField,
    TextField,
} from "../_shared/fields";

const createItem = (): FeatureItem => ({
    title: "New feature",
    description: "",
    icon: "Sparkles",
});

export function FeaturedEditor({
    settings,
    onChange,
}: WidgetEditorProps<FeaturedSettings>) {
    const update = (partial: Partial<FeaturedSettings>) =>
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
                    <span className="font-medium text-foreground">
                        Description
                    </span>
                    <Editor
                        initialContent={settings.description ?? emptyDoc}
                        onChange={(description: any) => update({ description })}
                        showToolbar={false}
                        editorClassName="min-h-[80px]"
                    />
                </div>
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
            <FieldGroup title="Features">
                <ListField<FeatureItem>
                    label="Feature items"
                    items={settings.items ?? []}
                    onChange={(items) => update({ items })}
                    createItem={createItem}
                    addLabel="Add feature"
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
                                onChange={(description) =>
                                    updateItem({ description })
                                }
                            />
                            <TextField
                                label="Icon (lucide-react name)"
                                value={item.icon}
                                placeholder="Globe"
                                onChange={(icon) => updateItem({ icon })}
                            />
                            <button
                                type="button"
                                className="self-start text-xs font-medium text-destructive hover:underline"
                                onClick={remove}
                            >
                                Remove feature
                            </button>
                        </>
                    )}
                />
            </FieldGroup>
        </div>
    );
}
