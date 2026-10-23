export const portfolioExample = Object.freeze({
  currency: 'USD', periodsPerYear: 1,
  dates: ['2026-01-31', '2026-02-28', '2026-03-31'],
  assets: [
    { id: 'AssetA', label: 'Fictional A', value: '600', returnsPct: ['10', '-10', '5'], shockPct: '-20' },
    { id: 'AssetB', label: 'Fictional B', value: '400', returnsPct: ['-5', '5', '0'], shockPct: '10' },
  ],
  snapshots: [
    { date: '2026-01-01', endingValue: '1000', externalFlow: '0' },
    { date: '2026-02-01', endingValue: '1600', externalFlow: '500' },
    { date: '2026-03-01', endingValue: '1440', externalFlow: '0' },
  ],
});
export const journalExample = Object.freeze({
  currency: 'USD', startingCapital: '1000',
  tradesCsv: 'id,date,strategy,grossPnl,fees,initialRisk\nA,2026-01-01,Momentum,120,10,50\nB,2026-01-02,MeanRevert,-80,5,40\nC,2026-01-03,Momentum,60,5,30\nD,2026-01-04,MeanRevert,-40,5,\n',
});
