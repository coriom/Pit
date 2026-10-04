import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";
import {
  acceptanceReport,
  appendAcceptanceEntry,
  listAcceptanceEntries,
  listAcceptanceSessions,
  startAcceptanceSession,
  type AcceptanceEntryData,
  type AcceptanceProtocol,
  type AcceptanceSession,
} from "../lib/acceptance-evidence";
import { storageEnabled, STORAGE_WARNING } from "../lib/storage-policy";
import { hlTransport } from "../lib/hyperliquid";
import { HL_RELEASE } from "../lib/execution-preflight";

type Context = {
  active: AcceptanceSession | undefined;
  capture: (
    protocol: AcceptanceProtocol,
    key: string,
    data: AcceptanceEntryData,
  ) => Promise<boolean>;
  issue: string;
};
const EvidenceContext = createContext<Context>({
  active: undefined,
  capture: async () => false,
  issue: "",
});
export const useAcceptanceEvidence = () => useContext(EvidenceContext);
function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AcceptanceEvidenceProvider({
  children,
  protocol,
}: {
  children: ReactNode;
  protocol: AcceptanceProtocol;
}) {
  const { address, chainId } = useAccount();
  const environmentReady =
    protocol === "cow"
      ? chainId === 11155111
      : hlTransport.isTestnet === true &&
        String(hlTransport.apiUrl) === HL_RELEASE.apiUrl &&
        String(hlTransport.rpcUrl) === HL_RELEASE.rpcUrl;
  const [active, setActive] = useState<AcceptanceSession>();
  const [sessions, setSessions] = useState<AcceptanceSession[]>([]);
  const [issue, setIssue] = useState("");
  useEffect(() => {
    setActive(undefined);
    setSessions([]);
    setIssue("");
    if (address && storageEnabled())
      void listAcceptanceSessions(address)
        .then(setSessions)
        .catch((e) => setIssue(`Evidence unavailable: ${String(e)}`));
  }, [address, protocol]);
  const selected =
    active &&
    active.account === address?.toLowerCase() &&
    active.protocol === protocol
      ? active
      : undefined;
  const value = useMemo<Context>(
    () => ({
      active: selected,
      issue,
      capture: async (kind, key, data) => {
        if (!selected || selected.protocol !== kind) return false;
        try {
          return await appendAcceptanceEntry(selected, key, data);
        } catch (error) {
          setIssue(
            `Evidence write failed; do not resubmit to repair it: ${error instanceof Error ? error.message : String(error)}`,
          );
          return false;
        }
      },
    }),
    [selected, issue],
  );
  async function exportSession(format: "json" | "markdown") {
    if (!selected) return;
    try {
      const report = acceptanceReport(
        selected,
        await listAcceptanceEntries(selected),
      );
      download(
        report[format],
        `pit-acceptance-${selected.id}.${format === "json" ? "json" : "md"}`,
        format === "json" ? "application/json" : "text/markdown",
      );
    } catch (e) {
      setIssue(`Evidence export failed: ${String(e)}`);
    }
  }
  return (
    <EvidenceContext.Provider value={value}>
      {children}
      <section className="panel" data-testid="acceptance-evidence">
        <h2>Acceptance evidence</h2>
        <p>Evidence capture does not mean live acceptance has passed.</p>
        {!storageEnabled() ? (
          <p>{STORAGE_WARNING}</p>
        ) : !address ? (
          <p>
            Connect an external testnet wallet to begin a local evidence
            session.
          </p>
        ) : (
          <>
            <p>
              Protocol: {protocol} · public account: {address}
            </p>
            {!environmentReady && (
              <p>
                Evidence session start requires the exact testnet environment.
              </p>
            )}
            <button
              disabled={!environmentReady}
              onClick={async () => {
                try {
                  const next = await startAcceptanceSession(protocol, address);
                  setActive(next);
                  setSessions((old) => [...old, next]);
                  setIssue("");
                } catch (e) {
                  setIssue(`Evidence session unavailable: ${String(e)}`);
                }
              }}
            >
              Start local acceptance session
            </button>
            <label>
              Recorded sessions{" "}
              <select
                value={selected?.id ?? ""}
                onChange={(e) =>
                  setActive(sessions.find((s) => s.id === e.target.value))
                }
              >
                <option value="">Select session</option>
                {sessions
                  .filter((s) => s.protocol === protocol)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.startedAt} · {s.id}
                    </option>
                  ))}
              </select>
            </label>
            {selected && (
              <div className="row">
                <button onClick={() => void exportSession("json")}>
                  Export evidence JSON
                </button>
                <button onClick={() => void exportSession("markdown")}>
                  Export evidence Markdown
                </button>
              </div>
            )}
          </>
        )}
        {issue && <p role="alert">{issue}</p>}
      </section>
    </EvidenceContext.Provider>
  );
}
