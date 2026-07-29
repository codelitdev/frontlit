"use client";

import React from "react";
import type { PageSeo } from "../models";
import { FieldGroup, TextField, ToggleField } from "../blocks/_shared/fields";

/**
 * Page-level SEO settings panel. Like the block and theme editors, changes
 * apply live — the host app persists them via the builder's `onChange`.
 * Adapted from CourseLit's SeoEditor, minus the media library (images are
 * referenced by URL, matching the rest of this package).
 */
export function SeoEditor({
    seo,
    onChange,
}: {
    seo: PageSeo;
    onChange: (seo: PageSeo) => void;
}) {
    const update = (next: Partial<PageSeo>) => onChange({ ...seo, ...next });
    const imageUrl = seo.socialImage?.file;

    return (
        <div className="flex flex-col">
            <FieldGroup title="Search results">
                <TextField
                    label="Title"
                    value={seo.title}
                    placeholder="Page title"
                    onChange={(title) => update({ title })}
                />
                <TextField
                    label="Description"
                    multiline
                    value={seo.description}
                    placeholder="A short summary of this page"
                    onChange={(description) => update({ description })}
                />
                <ToggleField
                    label="Search engine visibility"
                    value={seo.robotsAllowed ?? true}
                    onChange={(robotsAllowed) => update({ robotsAllowed })}
                />
            </FieldGroup>
            <FieldGroup title="Social card image">
                <TextField
                    label="Image URL"
                    value={imageUrl}
                    placeholder="https://..."
                    onChange={(file) =>
                        update({
                            socialImage: file
                                ? { mediaId: file, file }
                                : undefined,
                        })
                    }
                />
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt="Social card preview"
                        className="aspect-[1200/630] w-full rounded-md border border-border object-cover"
                    />
                )}
                <p className="text-xs text-muted-foreground">
                    Shown when the page is shared on social networks.
                    Recommended size 1200×630.
                </p>
            </FieldGroup>
        </div>
    );
}
