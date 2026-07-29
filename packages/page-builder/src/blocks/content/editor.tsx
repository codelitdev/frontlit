import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { ContentSettings } from "./settings";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import {
    FieldGroup,
    NumberField,
    SelectField,
    TextField,
} from "../_shared/fields";

export function ContentEditor({
    settings,
    onChange,
}: WidgetEditorProps<ContentSettings>) {
    const update = (partial: Partial<ContentSettings>) =>
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
                    <span className="font-medium text-foreground">Body</span>
                    <Editor
                        initialContent={settings.body ?? emptyDoc}
                        onChange={(body: any) => update({ body })}
                        editorClassName="min-h-[160px]"
                    />
                </div>
            </FieldGroup>
            <FieldGroup title="Media">
                <TextField
                    label="Image URL"
                    value={settings.media?.file}
                    placeholder="https://..."
                    onChange={(file) =>
                        update({
                            media: file ? { mediaId: file, file } : undefined,
                        })
                    }
                />
                <NumberField
                    label="Image corner radius"
                    value={settings.mediaRadius}
                    min={0}
                    max={8}
                    onChange={(mediaRadius) => update({ mediaRadius })}
                />
            </FieldGroup>
            <FieldGroup title="Layout">
                <SelectField
                    label="Media position"
                    value={settings.alignment ?? "left"}
                    onChange={(alignment) => update({ alignment })}
                    options={[
                        { label: "Left", value: "left" },
                        { label: "Right", value: "right" },
                    ]}
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
        </div>
    );
}
