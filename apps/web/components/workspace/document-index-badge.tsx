import { Badge } from "@/components/ui/codelit/badge";
import type { DocumentationIndex } from "@/lib/api";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/codelit/tooltip";

const LABEL: Record<DocumentationIndex["state"], string> = {
    pending: "Indexing…",
    indexed: "Indexed",
    failed: "Index failed",
    excluded: "Not in search",
};

const VARIANT: Record<
    DocumentationIndex["state"],
    "warning" | "success" | "destructive" | "outline"
> = {
    pending: "warning",
    indexed: "success",
    failed: "destructive",
    excluded: "outline",
};

export function DocumentIndexBadge({
    index,
}: {
    index: DocumentationIndex | null | undefined;
}) {
    if (!index) return null;
    const badge = (
        <Badge variant={VARIANT[index.state]}>{LABEL[index.state]}</Badge>
    );
    if (index.state === "failed" && index.lastError) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent>{index.lastError}</TooltipContent>
            </Tooltip>
        );
    }
    return badge;
}
