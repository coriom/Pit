import { storageEnabled, STORAGE_WARNING } from "../lib/storage-policy";
import { useAccount } from "wagmi";
import { useState } from "react";
import { downloadCSV } from "../lib/events";
export function Export() {
  const enabled = storageEnabled();
  const { address } = useAccount();
  const [status, setStatus] = useState("");
  async function run(derivatives = false) {
    try {
      const n = await downloadCSV(address!, derivatives);
      setStatus(`${n} records exported.`);
    } catch (e) {
      setStatus(String(e));
    }
  }
  return (
    <>
      <button disabled={!address || !enabled} onClick={() => run()}>
        Export for Taxlot
      </button>
      <button
        style={{ marginTop: 8 }}
        disabled={!address || !enabled}
        onClick={() => run(true)}
      >
        Perps review CSV
      </button>
      {!enabled && (
        <p role="alert" className="notice">
          {STORAGE_WARNING}
        </p>
      )}
      {enabled && (
        <p className="notice">
          Filled trades stay in this browser, ready to export for your tax
          workflow.
        </p>
      )}
      <p className="notice">
        Spot trades and derivative records export separately. Perps require tax
        review.
      </p>
      <small role="status">{status}</small>
    </>
  );
}
