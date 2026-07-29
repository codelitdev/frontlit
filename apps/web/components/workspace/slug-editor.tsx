"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { cn } from "@/lib/utils";

interface SlugEditorProps {
    slug: string;
    prefix: string;
    onSave: (slug: string) => Promise<string>;
    disabled?: boolean;
    disabledReason?: string;
    testId?: string;
}

export function SlugEditor({
    slug,
    prefix,
    onSave,
    disabled = false,
    disabledReason,
    testId,
}: SlugEditorProps) {
    const [value, setValue] = useState(slug);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setValue(slug);
    }, [slug]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const requestedSlug = value.trim();
        if (!requestedSlug) {
            setError("Enter a slug.");
            return;
        }

        setSaving(true);
        setError("");
        try {
            const savedSlug = await onSave(requestedSlug);
            setValue(savedSlug);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not update the slug.");
        } finally {
            setSaving(false);
        }
    }

    const errorId = `${testId ?? "resource"}-slug-error`;
    const helpId = `${testId ?? "resource"}-slug-help`;
    const unchanged = value === slug;

    return (
        <form className="w-full max-w-xl" onSubmit={handleSubmit}>
            <Label htmlFor={`${testId ?? "resource"}-slug`}>Slug</Label>
            <div className="mt-1 flex items-center gap-2">
                <div
                    className={cn(
                        "flex min-w-0 flex-1 items-center overflow-hidden rounded-[var(--radius)] border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_3px_var(--primary-soft)]",
                        error && "border-destructive focus-within:shadow-[0_0_0_3px_var(--destructive-soft)]",
                        disabled && "bg-muted opacity-60",
                    )}
                >
                    <span className="shrink-0 border-r px-3 text-sm text-muted-foreground">
                        {prefix}
                    </span>
                    <Input
                        id={`${testId ?? "resource"}-slug`}
                        value={value}
                        onChange={(event) => {
                            setValue(event.target.value);
                            setError("");
                        }}
                        disabled={disabled || saving}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : helpId}
                        autoComplete="off"
                        spellCheck={false}
                        data-testid={testId}
                        className="border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:shadow-none"
                    />
                </div>
                <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={disabled || saving || unchanged || !value.trim()}
                >
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>
            {error ? (
                <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
                    {error}
                </p>
            ) : (
                <p id={helpId} className="mt-1 text-xs text-muted-foreground">
                    {disabled && disabledReason
                        ? disabledReason
                        : "Changing this updates the public URL immediately."}
                </p>
            )}
        </form>
    );
}
