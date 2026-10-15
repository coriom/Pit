import { useRef, useState, type FormEvent } from "react";
import {
  APPROVAL_CHAIN_ID,
  APPROVAL_COVERAGE,
  APPROVAL_SPENDERS,
  APPROVAL_TOKENS,
  ApprovalInspectionError,
  approvalReportJSON,
  inspectTokenApprovals,
  sepoliaAddressUrl,
  type ApprovalReport,
} from "../lib/token-approvals";

const messages = {
  INVALID_ADDRESS:
    "Enter a valid public EVM address, including a valid checksum if mixed case is used.",
  WRONG_CHAIN:
    "The read-only RPC returned the wrong chain. No allowances were accepted.",
  RPC_UNAVAILABLE:
    "The Sepolia RPC did not return a usable block. Try again later.",
  STALE_BLOCK:
    "The Sepolia block is stale or has an invalid timestamp. No allowances were accepted.",
} as const;

export default function TokenApprovalInspector() {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState<ApprovalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Enter a public address to inspect four reviewed Sepolia allowance pairs.",
  );
  const requestId = useRef(0);

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = ++requestId.current;
    setReport(null);
    setBusy(true);
    setMessage("Reading the current Sepolia block and reviewed contracts…");
    try {
      const result = await inspectTokenApprovals(address);
      if (current !== requestId.current) return;
      setReport(result);
      const unavailable = result.rows.filter(
        (row) => row.state === "unavailable",
      ).length;
      setMessage(
        unavailable
          ? `Partial result: ${unavailable} of four allowance reads unavailable.`
          : "Four reviewed allowance pairs checked at one Sepolia block.",
      );
    } catch (error) {
      if (current !== requestId.current) return;
      setMessage(
        error instanceof ApprovalInspectionError
          ? messages[error.code]
          : "Read-only RPC inspection failed. No allowance conclusion is available.",
      );
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  }

  function download() {
    if (!report) return;
    const data = approvalReportJSON(report);
    const objectUrl = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "pit-sepolia-token-approvals.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <section
      className="panel approval-inspector"
      aria-label="Token Approval Inspector"
    >
      <p className="notice">
        Read-only · Ethereum Sepolia ({APPROVAL_CHAIN_ID}) · no wallet
        connection or signature
      </p>
      <form onSubmit={inspect}>
        <label htmlFor="approval-owner">Public EVM address</label>
        <input
          id="approval-owner"
          name="owner"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="0x…"
          value={address}
          onChange={(event) => {
            requestId.current++;
            setAddress(event.target.value);
            setReport(null);
            setBusy(false);
            setMessage("Address changed. Run a new read-only inspection.");
          }}
        />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Reading Sepolia…" : "Inspect approvals"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p className="muted">{APPROVAL_COVERAGE}</p>
      <p className="muted">
        An allowance is spending capacity, not a token balance or evidence of a
        transfer. It can remain after a swap attempt stops.
      </p>
      <p className="muted">
        Supported tokens:{" "}
        {APPROVAL_TOKENS.map((token) => token.label).join(" and ")}. Reviewed
        spenders:{" "}
        {APPROVAL_SPENDERS.map((spender) => spender.label).join(" and ")}.
      </p>
      {report && (
        <div data-testid="approval-report">
          <div className="rule">
            <h2>Observed allowances</h2>
            <p>
              Network: {report.network} ({report.chainId})
            </p>
            <p>
              Wallet:{" "}
              <a
                href={sepoliaAddressUrl(report.owner)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <code>{report.owner}</code>
              </a>
            </p>
            <p>
              Source block: {report.blockNumber} · block time{" "}
              {report.blockTimestamp} · observed {report.observedAt}
            </p>
          </div>
          <ul className="approval-list">
            {report.rows.map((row) => (
              <li
                className="approval-card"
                key={`${row.tokenId}:${row.spenderId}`}
                data-testid={`approval-${row.tokenId}-${row.spenderId}`}
              >
                <h3>
                  {row.tokenLabel} → {row.spenderLabel}
                </h3>
                <p>
                  Token:{" "}
                  <a
                    href={sepoliaAddressUrl(row.tokenAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>{row.tokenAddress}</code>
                  </a>
                </p>
                <p>
                  Spender:{" "}
                  <a
                    href={sepoliaAddressUrl(row.spenderAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>{row.spenderAddress}</code>
                  </a>
                </p>
                <p>
                  State: <strong>{row.state.toUpperCase()}</strong>
                  {row.issue ? ` · ${row.issue}` : ""}
                </p>
                <p>
                  Allowance: {row.readableAllowance ?? "unavailable"}{" "}
                  {row.readableAllowance === null ? "" : row.tokenSymbol}
                </p>
                <p>
                  Raw allowance:{" "}
                  <code>{row.rawAllowance ?? "unavailable"}</code>
                </p>
                <p>
                  Current balance: {row.readableBalance ?? "unavailable"}{" "}
                  {row.readableBalance === null ? "" : row.tokenSymbol}
                  {row.balanceIssue ? ` · ${row.balanceIssue}` : ""}
                </p>
                <p>
                  Verified decimals: {row.verifiedDecimals ?? "unavailable"}
                </p>
              </li>
            ))}
          </ul>
          <button type="button" onClick={download}>
            Download local JSON report
          </button>
          <p className="muted">
            This report is generated in your browser. PIT does not store
            searched addresses or approval results.
          </p>
        </div>
      )}
    </section>
  );
}
