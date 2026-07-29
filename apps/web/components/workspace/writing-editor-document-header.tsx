"use client";

import { Textarea } from "@/components/ui/codelit/textarea";

interface WritingEditorDocumentHeaderProps {
    title: string;
    titlePlaceholder: string;
    description: string;
    descriptionPlaceholder: string;
    onTitleChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    titleTestId?: string;
}

export function WritingEditorDocumentHeader({
    title,
    titlePlaceholder,
    description,
    descriptionPlaceholder,
    onTitleChange,
    onDescriptionChange,
    titleTestId,
}: WritingEditorDocumentHeaderProps) {
    return (
        <div className="px-6 pb-7 pt-12 sm:px-10">
            <Textarea
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={titlePlaceholder}
                rows={1}
                className="min-h-0 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-3xl font-bold leading-tight tracking-tight shadow-none [field-sizing:content] focus-visible:border-transparent focus-visible:shadow-none lg:text-4xl"
                data-testid={titleTestId}
            />
            <Textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder={descriptionPlaceholder}
                rows={2}
                className="mt-4 min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-lg leading-relaxed text-muted-foreground shadow-none focus-visible:border-transparent focus-visible:shadow-none"
            />
        </div>
    );
}
