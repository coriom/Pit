import { useAccount } from "wagmi";
import { useState } from "react";
import { downloadCSV } from "../lib/events";
export function Export() {
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
      <button disabled={!address} onClick={() => run()}>
        Export for Taxlot
      </button>
      <button
        style={{ marginTop: 8 }}
        disabled={!address}
        onClick={() => run(true)}
      >
        Perps review CSV
      </button>
      <p className="notice">
        Spot trades and derivative records export separately. Perps require tax
        review.
      </p>
      <small role="status">{status}</small>
    </>
  );
}
