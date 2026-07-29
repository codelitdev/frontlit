import { cn } from "@/lib/utils";

const BANNER_VARIANT_CLASS = {
    error: "bg-destructive/10 text-destructive",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
};

export function Banner({
    variant = "error",
    children,
    className,
}: {
    variant?: "error" | "success" | "warning";
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-md px-3 py-2 text-sm",
                BANNER_VARIANT_CLASS[variant],
                className,
            )}
        >
            {children}
        </div>
    );
}
