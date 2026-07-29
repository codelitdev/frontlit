import { Loader } from "@codelitdev/design-system";
import { cn } from "@/lib/utils";

/** Standard "loading" state — the design system's animated FrontLit mark. */
export function Loading({
    className,
    label = "Loading…",
}: {
    className?: string;
    label?: string;
}) {
    return (
        <p
            className={cn(
                "flex items-center gap-2 text-sm text-muted-foreground",
                className,
            )}
        >
            <span className="text-primary">
                <Loader product="frontlit" size={16} />
            </span>
            {label}
        </p>
    );
}

/** Full-viewport loading state for standalone editor routes. */
export function FullScreenLoading({ label = "Loading…" }: { label?: string }) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loading label={label} />
        </div>
    );
}
