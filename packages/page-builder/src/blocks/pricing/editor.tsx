import React from "react";
import type { WidgetEditorProps } from "../../models";
import type { PricingSettings, PricingTier } from "./settings";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import {
    FieldGroup,
    ListField,
    SelectField,
    TextField,
    ToggleField,
} from "../_shared/fields";

const createTier = (): PricingTier => ({
    name: "New plan",
    price: "$0/mo",
    description: "",
    features: [],
    buttonCaption: "Get started",
    buttonAction: "#",
});

export function PricingEditor({
    settings,
    onChange,
}: WidgetEditorProps<PricingSettings>) {
    const update = (partial: Partial<PricingSettings>) =>
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
            <FieldGroup title="Pricing tiers">
                <ListField<PricingTier>
                    label="Tiers"
                    items={settings.tiers ?? []}
                    onChange={(tiers) => update({ tiers })}
                    createItem={createTier}
                    addLabel="Add tier"
                    renderItem={(tier, updateTier, remove) => (
                        <>
                            <TextField
                                label="Name"
                                value={tier.name}
                                onChange={(name) => updateTier({ name })}
                            />
                            <TextField
                                label="Price"
                                value={tier.price}
                                placeholder="$29/mo"
                                onChange={(price) => updateTier({ price })}
                            />
                            <TextField
                                label="Description"
                                value={tier.description}
                                multiline
                                onChange={(description) =>
                                    updateTier({ description })
                                }
                            />
                            <TextField
                                label="Features (one per line)"
                                value={(tier.features ?? []).join("\n")}
                                multiline
                                onChange={(value) =>
                                    updateTier({
                                        features: value
                                            .split("\n")
                                            .map((f) => f.trim())
                                            .filter(Boolean),
                                    })
                                }
                            />
                            <TextField
                                label="Button text"
                                value={tier.buttonCaption}
                                onChange={(buttonCaption) =>
                                    updateTier({ buttonCaption })
                                }
                            />
                            <TextField
                                label="Button link"
                                value={tier.buttonAction}
                                onChange={(buttonAction) =>
                                    updateTier({ buttonAction })
                                }
                            />
                            <ToggleField
                                label="Highlight this tier"
                                value={tier.highlighted}
                                onChange={(highlighted) =>
                                    updateTier({ highlighted })
                                }
                            />
                            <button
                                type="button"
                                className="self-start text-xs font-medium text-destructive hover:underline"
                                onClick={remove}
                            >
                                Remove tier
                            </button>
                        </>
                    )}
                />
            </FieldGroup>
        </div>
    );
}
