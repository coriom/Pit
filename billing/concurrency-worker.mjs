import { parentPort, workerData } from 'node:worker_threads';
import { BillingStore } from './store.mjs';
const store = new BillingStore(workerData.path);
try {
  store.debit('alice', 80, workerData.source, workerData.now, { testOnly: true });
  parentPort.postMessage({ ok: true });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
} finally { store.close(); }
