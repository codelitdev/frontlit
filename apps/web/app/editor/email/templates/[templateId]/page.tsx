"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { EmailEditor, type Email } from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
    type EmailTemplate,
    listEmailTemplates,
    updateEmailTemplate,
} from "@/lib/api";
import { FullScreenLoading } from "@/components/workspace/loading";
import { Banner } from "@/components/workspace/banner";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";

type EditableTemplate = {
    template: EmailTemplate;
    body: Email;
    managedFooter?: Email["content"][number];
};

function cloneEmail(email: Email): Email {
    return JSON.parse(JSON.stringify(email)) as Email;
}

function editorDocumentFromBody(
    body: EmailTemplate["body"],
): Pick<EditableTemplate, "body" | "managedFooter"> {
    const email = cloneEmail(body as unknown as Email);
    const footer = email.content.at(-1);
    if (footer?.blockType === "footer") {
        return {
            body: { ...email, content: email.content.slice(0, -1) },
            managedFooter: footer,
        };
    }
    return { body: email };
}

/** Full-screen editor for a reusable, SendLit-backed email template. */
export default function EmailTemplateEditorPage({
    params,
}: {
    params: Promise<{ templateId: string }>;
}) {
    const { templateId } = use(params);
    const [editable, setEditable] = useState<EditableTemplate | null>(null);
    const [title, setTitle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const bodyRef = useRef<Email | null>(null);

    useEffect(() => {
        listEmailTemplates()
            .then(({ items }) => {
                const template = items.find(
                    (item) => item.templateId === templateId,
                );
                if (!template) {
                    setError("Template not found.");
                    return;
                }
                const document = editorDocumentFromBody(template.body);
                bodyRef.current = document.body;
                setTitle(template.title);
                setEditable({ template, ...document });
            })
            .catch((err) =>
                setError(
                    err instanceof ApiError
                        ? err.message
                        : "Failed to load template.",
                ),
            );
    }, [templateId]);

    const handleBodyChange = useCallback((body: Email) => {
        bodyRef.current = body;
    }, []);

    async function save() {
        if (!editable || !bodyRef.current) return;

        setSaving(true);
        setError(null);
        try {
            const updated = await updateEmailTemplate(templateId, {
                title: title.trim() || editable.template.title,
                body: {
                    ...bodyRef.current,
                    content: editable.managedFooter
                        ? [...bodyRef.current.content, editable.managedFooter]
                        : bodyRef.current.content,
                } as unknown as Record<string, unknown>,
            });
            setEditable((current) =>
                current ? { ...current, template: updated } : current,
            );
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Failed to save template.",
            );
        } finally {
            setSaving(false);
        }
    }

    if (error && !editable) {
        return (
            <div className="flex h-dvh items-center justify-center p-6">
                <div className="w-full max-w-md space-y-4">
                    <Banner>{error}</Banner>
                    <Button asChild variant="outline">
                        <Link href="/email?tab=templates">
                            <ArrowLeft />
                            Back to email
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    if (!editable) return <FullScreenLoading label="Loading template…" />;

    return (
        <div className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
            <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/email?tab=templates">
                            <ArrowLeft />
                            Email
                        </Link>
                    </Button>
                    <p className="truncate text-sm font-semibold">
                        Editing template
                    </p>
                </div>
                <Button onClick={save} disabled={saving}>
                    {saved ? <Check /> : null}
                    {saving ? "Saving…" : saved ? "Saved" : "Save template"}
                </Button>
            </header>

            {error && <Banner className="mx-4 mt-4 shrink-0">{error}</Banner>}

            <div className="shrink-0 border-b px-6 py-3">
                <Label htmlFor="template-title">Template name</Label>
                <Input
                    id="template-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Template name"
                    className="mt-1 max-w-2xl"
                />
            </div>

            <main className="min-h-0 min-w-0 flex-1">
                <EmailEditor
                    email={editable.body}
                    onChange={handleBodyChange}
                />
            </main>
        </div>
    );
}
