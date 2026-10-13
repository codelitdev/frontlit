"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/codelit/icon-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteConfirm({
  title = "Are you sure?",
  description,
  onConfirm,
  disabled,
  trigger,
  confirmLabel = "Delete",
  open: controlledOpen,
  onOpenChange,
}: {
  title?: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  trigger?: React.ReactNode | null;
  confirmLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [busy, setBusy] = useState(false);

  async function confirmDeletion() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <AlertDialogTrigger asChild disabled={disabled}>
          {trigger ?? (
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={title}
              className="text-muted-foreground hover:text-destructive"
              disabled={disabled}
            >
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeletion}
            disabled={busy}
            variant="destructive"
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
