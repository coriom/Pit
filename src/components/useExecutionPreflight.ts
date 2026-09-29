import { useEffect, useState } from "react";
import {
  preflightResult,
  type PreflightCode,
} from "../lib/execution-preflight";
// Results are bound to the exact input key and expire even if a read hangs.
export function useExecutionPreflight(
  key: string,
  check: () => Promise<unknown>,
) {
  const [state, setState] = useState({
    key: "",
    code: "CHECKING" as PreflightCode,
    at: 0,
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let stopped = false;
    let pending = false;
    const run = async () => {
      if (pending) return;
      pending = true;
      const at = Date.now();
      const code = await preflightResult(check);
      pending = false;
      if (!stopped) setState({ key, code, at });
    };
    void run();
    const poll = setInterval(() => {
      setNow(Date.now());
      void run();
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(poll);
    };
  }, [key, check]);
  return state.key === key && now - state.at < 10000 ? state.code : "CHECKING";
}
