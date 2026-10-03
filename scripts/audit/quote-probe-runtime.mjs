// Node-only, request-scoped transport for the read-only diagnostic probe.
const RETRYABLE_CODES = new Set([
  "EAI_AGAIN",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function probeExitCode(results) {
  if (results.some((result) => result.status === "COMPARISON_OK")) return 0;
  if (results.some((result) => result.status === "CONFIG_OR_READ_FAILURE"))
    return 3;
  return 2;
}

function isTransientError(error) {
  if (error?.name === "TimeoutError") return true;
  for (
    let current = error, depth = 0;
    current && depth < 6;
    current = current.cause, depth++
  ) {
    if (RETRYABLE_CODES.has(current.code)) return true;
  }
  return false;
}

function retryAfterMs(value, now) {
  if (value === null) return 150;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : Infinity;
}

async function sleep(ms, signal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function createProbeFetch(
  expectedUrl,
  { fetchImpl = fetch, now = Date.now, wait = sleep } = {},
) {
  const approved = new URL(expectedUrl);
  if (
    approved.protocol !== "https:" ||
    approved.username ||
    approved.password ||
    approved.search
  )
    throw new Error("CONFIG_INVALID: diagnostic RPC URL");
  return async (input, init = {}) => {
    const actual = new URL(String(input));
    if (actual.href !== approved.href && actual.href !== `${approved.href}/`)
      throw new Error("CONFIG_INVALID: diagnostic RPC endpoint changed");
    const deadline = now() + 8000;
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - now();
      if (remaining <= 0 || init.signal?.aborted)
        throw init.signal?.reason ?? new Error("Probe RPC deadline exceeded");
      const signal = AbortSignal.any([
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(Math.min(3500, remaining)),
      ]);
      let response;
      try {
        response = await fetchImpl(input, { ...init, signal });
      } catch (error) {
        if (attempt || init.signal?.aborted || !isTransientError(error))
          throw error;
        if (deadline - now() <= 150) throw error;
        await wait(150, init.signal);
        continue;
      }
      if (attempt || !RETRYABLE_STATUS.has(response.status)) return response;
      const delay = retryAfterMs(response.headers.get("Retry-After"), now);
      if (!Number.isFinite(delay) || delay >= deadline - now()) return response;
      await response.body?.cancel();
      await wait(delay, init.signal);
    }
    throw new Error("Probe RPC retry budget exhausted");
  };
}
