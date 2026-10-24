// A pop-up that asks "are you sure?" before something that can't be undone.
// danger=true makes the confirm button red (for penalties).
import { useEffect } from "react";

export default function ConfirmModal({
  title, children, confirmLabel = "Confirm", cancelLabel = "Cancel",
  danger = false, busy = false, onConfirm, onCancel,
}) {
  // Close with the Escape key
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="card modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()} // clicks inside don't close it
      >
        <h3 id="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="btn-row modal-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={danger ? "btn btn-danger" : "btn"} onClick={onConfirm} disabled={busy}>
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
