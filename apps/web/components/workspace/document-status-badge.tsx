import { Badge, type badgeVariants } from "@/components/ui/codelit/badge";
import type { VariantProps } from "class-variance-authority";

export type DocumentStatus = "draft" | "published" | "published_with_changes";

const STATUS_LABEL: Record<DocumentStatus, string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · changes",
};

const VARIANT: Record<DocumentStatus, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
    draft: "neutral",
    published: "neutral",
    published_with_changes: "warning",
};

export function DocumentStatusBadge({ status, "data-testid": testId }: { status: DocumentStatus; "data-testid"?: string }) {
    return (
        <Badge variant={VARIANT[status]} data-testid={testId}>
            {STATUS_LABEL[status]}
        </Badge>
    );
}
