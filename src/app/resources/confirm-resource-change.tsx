"use client";

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type PendingResourceChange = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<boolean>;
};

export default function ConfirmResourceChange({ pending, busy, error, onCancel, onConfirm }: {
  pending: PendingResourceChange | null;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <AlertDialog open={!!pending} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <AlertDialogContent className="resource-review-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
        <AlertDialogDescription>{pending?.description} This change is saved to the research database after you confirm.</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p className="form-error" role="alert">{error}</p>}
      <AlertDialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : pending?.confirmLabel || "Confirm"}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
