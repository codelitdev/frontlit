import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { EmailFormSettings } from "./settings";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import { FieldGroup, SelectField, TextField } from "../_shared/fields";

export function EmailFormEditor({
    settings,
    onChange,
}: WidgetEditorProps<EmailFormSettings>) {
    const update = (partial: Partial<EmailFormSettings>) =>
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
            </FieldGroup>
            <FieldGroup title="Form">
                <TextField
                    label="Button text"
                    value={settings.buttonCaption}
                    onChange={(buttonCaption) => update({ buttonCaption })}
                />
                <TextField
                    label="Success message"
                    value={settings.successMessage}
                    onChange={(successMessage) => update({ successMessage })}
                />
            </FieldGroup>
            <FieldGroup title="Layout">
                <SelectField
                    label="Alignment"
                    value={settings.alignment ?? "left"}
                    onChange={(alignment) => update({ alignment })}
                    options={[
                        { label: "Left", value: "left" },
                        { label: "Center", value: "center" },
                    ]}
                />
            </FieldGroup>
        </div>
    );
}
