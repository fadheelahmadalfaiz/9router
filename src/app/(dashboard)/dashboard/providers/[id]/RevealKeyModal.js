"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";

// Re-authenticated reveal of a single connection's API key. Posts the dashboard
// password to /api/providers/:id/reveal, copies the returned value to the
// clipboard exactly once, and closes. The password is never persisted.
export default function RevealKeyModal({ isOpen, connection, onClose, onSuccess, onError }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setError("");
      setBusy(false);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  if (!isOpen || !connection) return null;

  const fieldHint = connection.authType === "cookie"
    ? "Cookie access token"
    : "API key";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/providers/${connection.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Failed to reveal credential";
        setError(msg);
        onError?.(msg);
        return;
      }
      if (!data?.value) {
        setError("No secret stored for this connection");
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(data.value);
        } else {
          const ta = document.createElement("textarea");
          ta.value = data.value;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        onSuccess?.(`${fieldHint} copied to clipboard`);
      } catch {
        onError?.("Revealed but clipboard write failed — paste manually");
      }
      setPassword("");
      onClose();
    } catch (err) {
      setError(err?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title={`Reveal ${fieldHint}`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-text-muted leading-relaxed">
          Enter your dashboard password to reveal the {fieldHint.toLowerCase()} for
          <span className="font-medium text-text-main"> {connection.name || connection.email || connection.id}</span>.
          The value is copied to clipboard once and never stored by the UI.
        </p>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Dashboard password</label>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        <div className="flex gap-2">
          <Button
            type="submit"
            fullWidth
            disabled={!password || busy}
          >
            {busy ? "Revealing…" : "Reveal & Copy"}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => !busy && onClose()} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

RevealKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    authType: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
  onError: PropTypes.func,
};