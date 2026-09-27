"use client";

import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

// The CLI binary is still published as `9router` (npm package + bin name).
// Only the product display name is rebranded, so the command below must stay
// in sync with cli/package.json -> "bin".
const CLI_COMMAND = "9router";

export default function TroubleSigningInModal({ isOpen, onClose }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Trouble signing in?" size="md">
      <div className="flex flex-col gap-5 text-sm">
        <p className="text-text-muted">
          If you&apos;ve forgotten the dashboard password, you can reset it from the host
          machine where IzRouter is running.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar text-[11px] font-semibold text-text-main">
              1
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-text-main">Open a terminal on the host</span>
              <span className="text-xs text-text-muted">
                Any shell that can reach the IzRouter process works.
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar text-[11px] font-semibold text-text-main">
              2
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-medium text-text-main">
                Run the CLI and open Settings
              </span>
              <span className="text-xs text-text-muted">
                Choose <span className="text-text-main">Settings</span> →{" "}
                <span className="text-text-main">Reset Password to Default</span>.
              </span>
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-sidebar/40 px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-text-main">
                  {CLI_COMMAND}
                </code>
                <button
                  type="button"
                  onClick={() => copy(CLI_COMMAND, "reset-cli-cmd")}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-text-muted transition-colors hover:bg-sidebar hover:text-text-primary"
                  aria-label="Copy CLI command"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copied === "reset-cli-cmd" ? "check" : "content_copy"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar text-[11px] font-semibold text-text-main">
              3
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-text-main">Sign in again</span>
              <span className="text-xs text-text-muted">
                The password returns to the configured default (
                <code className="font-mono">INITIAL_PASSWORD</code>, or{" "}
                <code className="font-mono">123456</code> if unset). You&apos;ll be asked to set
                a new password right after logging in remotely.
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-sidebar/30 px-3 py-2 text-xs text-text-muted">
          <span className="font-medium text-text-main">Locked out by SSO?</span>{" "}
          Use the same CLI menu → <span className="text-text-main">Reset Auth Mode to Password</span>{" "}
          to regain password login.
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

TroubleSigningInModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};
