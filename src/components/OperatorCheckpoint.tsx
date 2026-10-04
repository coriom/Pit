import { useState } from "react";
import { operatorActionAllowed } from "../lib/operator-readiness";
import type { PreflightCode } from "../lib/execution-preflight";

export function OperatorCheckpoint({
  action,
  details,
  gate,
  dryRun,
  busy,
  onConfirm,
  onDryRun,
}: {
  action: string;
  details: readonly string[];
  gate: PreflightCode;
  dryRun: boolean;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onDryRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div data-testid="operator-checkpoint">
      <button
        className="primary"
        disabled={busy || (!dryRun && gate !== "GREEN")}
        onClick={() => {
          setOpen(true);
          setConfirmed(false);
        }}
      >
        {dryRun ? `Preview ${action} · dry run` : `Review ${action}`}
      </button>
      {open && (
        <div
          className="panel"
          role="dialog"
          aria-label={`${action} checkpoint`}
        >
          <h3>
            {dryRun ? "Dry-run checkpoint" : "Operator checkpoint"}: {action}
          </h3>
          {details.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
          <p>
            {dryRun
              ? "Simulation only. No wallet or submission API will be called."
              : "Inspect and explicitly approve the separate external-wallet prompt. Cancel any unexpected prompt."}
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            I reviewed the network, amount, fee and accounting outcome.
          </label>
          <div className="row">
            <button
              onClick={() => {
                setOpen(false);
                setConfirmed(false);
              }}
            >
              Cancel
            </button>
            <button
              disabled={
                busy ||
                !confirmed ||
                (!dryRun && !operatorActionAllowed(dryRun, gate, confirmed))
              }
              onClick={async () => {
                setOpen(false);
                setConfirmed(false);
                if (dryRun) {
                  onDryRun();
                  return;
                }
                if (!operatorActionAllowed(dryRun, gate, confirmed)) return;
                await onConfirm();
              }}
            >
              {dryRun
                ? "Advance dry run"
                : `Continue to external wallet: ${action}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
