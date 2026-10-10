"use client";

import type { ReactNode } from "react";
import { Check, ChevronRight, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = ["Repository", "Folder", "Review", "Connect"] as const;

/** Dialog chrome for the connect flow: title, progress stepper, scrolling body, footer. */
export function WizardShell({
  header,
  current,
  finished = false,
  footer,
  children,
}: {
  /** Dialog title and description, so the dialog keeps its accessible name. */
  header: ReactNode;
  /** Index of the active step in WIZARD_STEPS. */
  current: number;
  finished?: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex flex-col gap-4 border-b border-border px-6 pt-5 pb-4 pr-14">
        {header}
        <ol aria-label="Setup progress" className="flex items-center gap-2">
          {WIZARD_STEPS.map((label, i) => {
            const done = finished || i < current;
            const active = i === current && !finished;
            return (
              <li key={label} className="contents">
                {i > 0 && (
                  <span aria-hidden className="h-px min-w-4 flex-1 bg-border" />
                )}
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap text-[13px] font-medium",
                    done || active ? "text-foreground" : "text-muted-foreground",
                    active && "font-semibold",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-[22px] place-items-center rounded-full border-[1.5px] text-xs font-semibold",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary text-primary"
                          : "border-input text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-y-auto px-6 py-5">
        {children}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
        {footer}
      </footer>
    </div>
  );
}

export function StepIntro({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-base leading-tight">{title}</h3>
      <p className="mt-1 text-muted-foreground text-sm">{lead}</p>
    </div>
  );
}

export function SummaryCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-clip rounded-[0.625rem] border border-border">
      {children}
    </div>
  );
}

export function SummaryRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[50px] items-center gap-4 border-t border-border px-4 py-3 text-sm first:border-t-0">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {children}
      </span>
      {action}
    </div>
  );
}

export function LinkButton({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="rounded px-1 py-0.5 font-semibold text-[13px] text-primary underline-offset-2 hover:underline focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[12.5px]">
      {children}
    </code>
  );
}

export function FileList({ files }: { files: string[] }) {
  return (
    <ul
      aria-label="Files to copy"
      className="flex flex-col gap-1.5 border-t border-border bg-background py-2.5 pr-4 pl-[8rem] text-muted-foreground text-sm"
    >
      {files.map((file) => (
        <li key={file} className="break-all font-mono text-[13px]">
          {file}
        </li>
      ))}
    </ul>
  );
}

export function Callout({
  title,
  tone = "warning",
  children,
}: {
  title: string;
  tone?: "warning" | "info" | "danger";
  children: ReactNode;
}) {
  const Icon = tone === "danger" ? CircleAlert : tone === "info" ? Info : TriangleAlert;
  return (
    <div
      role={tone === "danger" ? "alert" : "note"}
      className={cn(
        "flex gap-3 rounded-[0.625rem] px-4 py-3.5 text-sm",
        tone === "danger"
          ? "bg-[var(--destructive-soft)]"
          : tone === "info"
            ? "bg-muted"
            : "bg-[var(--warning-soft)]",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-[18px] shrink-0",
          tone === "danger"
            ? "text-destructive"
            : tone === "info"
              ? "text-muted-foreground"
              : "text-[var(--warning)]",
        )}
      />
      <span>
        <b className="mb-0.5 block font-semibold">{title}</b>
        {children}
      </span>
    </div>
  );
}

export type TimelineState = "done" | "current" | "todo";

export function Timeline({
  items,
}: {
  items: { title: string; note: string; state: TimelineState; waiting?: string }[];
}) {
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <li
          key={item.title}
          className={cn(
            "relative flex gap-3.5 pb-[18px] last:pb-0",
            i < items.length - 1 &&
              "before:absolute before:top-[26px] before:bottom-0.5 before:left-[11px] before:w-[1.5px] before:bg-border",
          )}
        >
          <span
            className={cn(
              "relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
              item.state === "done" && "bg-[var(--success-soft)] text-[var(--success)]",
              item.state === "current" &&
                "bg-[var(--primary-soft)] text-primary shadow-[0_0_0_4px_var(--primary-soft)]",
              item.state === "todo" && "bg-muted text-muted-foreground",
            )}
          >
            {item.state === "done" ? (
              <Check className="size-3.5" strokeWidth={3} />
            ) : (
              i + 1
            )}
          </span>
          <span className="flex flex-col gap-0.5 pt-0.5 text-sm">
            <b
              className={cn(
                "font-medium",
                item.state === "todo" && "font-normal text-muted-foreground",
                item.state === "current" && "font-semibold",
              )}
            >
              {item.title}
            </b>
            <span className="text-muted-foreground text-xs leading-snug">
              {item.note}
            </span>
            {item.state === "current" && item.waiting && (
              <span className="inline-flex items-center gap-2 text-muted-foreground text-xs">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                {item.waiting}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ConsentRow({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[0.625rem] border px-4 py-3.5 text-sm focus-within:shadow-[var(--shadow-focus)]",
        checked ? "border-primary bg-[var(--primary-soft)]" : "border-border",
      )}
    >
      <input
        type="checkbox"
        className="mt-px size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[13px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        {label}
      </summary>
      <div className="mt-3 space-y-3 rounded-[0.625rem] border border-border bg-background px-4 py-3.5 text-[13px]">
        {children}
      </div>
    </details>
  );
}

export function StatusBanner({
  tone = "success",
  children,
}: {
  tone?: "success" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 font-semibold text-sm",
        tone === "success" ? "text-[var(--success)]" : "text-[var(--warning)]",
      )}
    >
      <Check className="size-[18px]" strokeWidth={2.4} />
      {children}
    </div>
  );
}
