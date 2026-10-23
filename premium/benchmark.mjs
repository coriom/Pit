import { performance } from 'node:perf_hooks';
import { statSync } from 'node:fs';
import { portfolioBatchRisk, advancedTradingJournal } from '../dist-premium-local/reports.mjs';

// Repeat bounded, deterministic workloads. RSS is process-wide, not per-request.
const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const portfolio = { currency: 'USD', periodsPerYear: 365, dates, assets: Array.from({ length: 8 }, (_, i) => ({ id: `asset${i}`, label: `Asset ${i}`, value: String((i + 1) * 1000), returnsPct: dates.map((_, j) => String(((j * (i + 3)) % 13) - 6)), shockPct: String(i - 4) })) };
const journal = { currency: 'USD', startingCapital: '1000000', tradesCsv: ['id,date,strategy,grossPnl,fees,initialRisk', ...Array.from({ length: 500 }, (_, i) => `trade${i},${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)},${i % 2 ? 'Trend' : 'Range'},${i % 3 ? '12' : '-15'},1,10`)].join('\r\n') };
function measure(name, runner, input) {
  const times = [], before = process.memoryUsage();
  for (let i = 0; i < 30; i++) {
    const start = performance.now(); const result = runner(input);
    if (!result.report || !result.csv) throw new Error('Benchmark report missing.');
    times.push(performance.now() - start);
  }
  const after = process.memoryUsage(); times.sort((a, b) => a - b);
  return { workload: name, iterations: times.length, medianMs: Number(times[15].toFixed(3)), p95Ms: Number(times[28].toFixed(3)), maximumMs: Number(times[29].toFixed(3)), rssBeforeMiB: Number((before.rss / 1048576).toFixed(2)), rssAfterMiB: Number((after.rss / 1048576).toFixed(2)), heapDeltaMiB: Number(((after.heapUsed - before.heapUsed) / 1048576).toFixed(2)) };
}
console.log(JSON.stringify({ node: process.version, bundleBytes: statSync('dist-premium-local/reports.mjs').size, portfolio: measure('8 assets x 60 synchronized returns', portfolioBatchRisk, portfolio), journal: measure('500 closed trades', advancedTradingJournal, journal) }, null, 2));
