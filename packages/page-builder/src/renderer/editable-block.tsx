"use client";

import React from "react";
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "../primitives/lib/utils";

export interface EditableBlockProps {
  children: React.ReactNode;
  editing: boolean;
  /** Ref to the wrapper element so the canvas can scroll the block into view. */
  containerRef?: React.Ref<HTMLDivElement>;
  selected?: boolean;
  /** Draws a temporary attention flash, e.g. right after the block was moved. */
  highlighted?: boolean;
  label?: string;
  onSelect?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  onAddBelow?: () => void;
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded bg-background text-foreground shadow-sm hover:bg-muted"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Two-click delete: first click arms the button ("Sure?"), second click
 * actually deletes. Disarms after a short delay or when the pointer leaves.
 */
function DeleteButton({ onDelete }: { onDelete?: () => void }) {
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (!confirming) return;
    const timeout = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirming]);

  if (!onDelete) return null;

  if (confirming) {
    return (
      <button
        type="button"
        title="Confirm delete"
        aria-label="Confirm delete"
        className="inline-flex h-7 items-center justify-center rounded bg-destructive px-2 text-xs font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90"
        onMouseLeave={() => setConfirming(false)}
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(false);
          onDelete();
        }}
      >
        Sure?
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Delete"
      aria-label="Delete"
      className="inline-flex h-7 w-7 items-center justify-center rounded bg-background text-foreground shadow-sm hover:bg-muted"
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Wraps a rendered block with hover/selection affordances when the page
 * builder is in editing mode. In non-editing (plain display) mode it's a
 * transparent passthrough.
 */
export function EditableBlock({
  children,
  editing,
  containerRef,
  selected,
  highlighted,
  label,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddBelow,
}: EditableBlockProps) {
  if (!editing) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/block relative outline outline-1 outline-transparent transition-colors hover:outline-primary/40",
        selected && "outline-2 outline-primary",
        highlighted && "outline-2 outline-primary/70",
      )}
      onClick={onSelect}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 bg-primary/10 opacity-0 transition-opacity duration-500",
          highlighted && "opacity-100",
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center opacity-0 transition-opacity group-hover/block:opacity-100">
        <div className="pointer-events-auto flex items-center gap-1 rounded-b-md border border-t-0 border-border bg-background px-1.5 py-1 shadow-sm">
          {label && (
            <span className="px-1.5 text-xs font-medium text-muted-foreground">
              {label}
            </span>
          )}
          <ToolbarButton icon={Settings2} label="Edit settings" onClick={onSelect} />
          <ToolbarButton icon={ArrowUp} label="Move up" onClick={onMoveUp} />
          <ToolbarButton icon={ArrowDown} label="Move down" onClick={onMoveDown} />
          <DeleteButton onDelete={onDelete} />
        </div>
      </div>
      {children}
      {onAddBelow && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-3 z-20 flex justify-center opacity-0 transition-opacity group-hover/block:opacity-100">
          <button
            type="button"
            title="Add block below"
            aria-label="Add block below"
            className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onAddBelow();
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
