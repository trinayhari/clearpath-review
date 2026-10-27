"use client";
import { useState } from "react";
import { X, Trash2, Archive, RotateCcw } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
export type LifecycleAction = "close" | "reopen" | "delete" | "restore";
const copy = {
  close: {
    title: "Close this review?",
    action: "Close review",
    description:
      "Take this review out of the open queue. The copy, discussion and decisions stay on record. You can reopen it later.",
    Icon: Archive,
  },
  reopen: {
    title: "Reopen this review?",
    action: "Reopen review",
    description:
      "Return this review to the open queue with its existing version and review status. Reopening does not change or grant approval.",
    Icon: RotateCcw,
  },
  delete: {
    title: "Move this review to Trash?",
    action: "Move to Trash",
    description:
      "Remove this review from the active workspace. Its copy and audit history are retained in Trash, where the author or team owner can restore it. This does not permanently erase a compliance record.",
    Icon: Trash2,
  },
  restore: {
    title: "Restore this review?",
    action: "Restore review",
    description:
      "Return this review to its previous open or closed state. Its versions, discussion and decisions are kept exactly as they were.",
    Icon: RotateCcw,
  },
};
export function ReviewLifecycleDialog({
  action,
  title,
  busy,
  error,
  unsaved,
  onClose,
  onConfirm,
}: {
  action: LifecycleAction;
  title: string;
  busy: boolean;
  error?: string;
  unsaved?: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [reason, setReason] = useState("");
  const text = copy[action];
  const Icon = text.Icon;
  return (
    <Modal
      labelledBy="lifecycle-title"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <section className="modal panel lifecycle-dialog">
        <button
          className="modal-close"
          aria-label="Cancel review action"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span
          className={`lifecycle-dialog-icon ${action === "delete" ? "danger" : ""}`}
        >
          <Icon size={24} />
        </span>
        <h2 id="lifecycle-title">{text.title}</h2>
        <p className="lifecycle-review-title">{title}</p>
        <p>{text.description}</p>
        {unsaved && (action === "close" || action === "delete") && (
          <p className="unsaved-warning">
            You have unsaved edits. This action keeps the last saved version,
            not the text in your editor. Cancel and save a new version first if
            you want to keep those edits.
          </p>
        )}
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <label>
          Reason <span className="muted">(optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Add context for your team…"
          />
        </label>
        <div className="form-actions">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            disabled={busy}
            onClick={() => onConfirm(reason)}
          >
            {busy ? "Saving…" : text.action}
          </Button>
        </div>
      </section>
    </Modal>
  );
}
