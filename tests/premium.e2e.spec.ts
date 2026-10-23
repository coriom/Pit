import { test, expect } from '@playwright/test';

test('portfolio and journal reports debit once, render safely and export locally', async ({ page, context }) => {
  const unexpected: string[] = [];
  await page.addInitScript(() => {
    const attempts: string[] = [];
    (window as typeof window & { __pitAttempts?: string[] }).__pitAttempts = attempts;
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { value: function (...args: unknown[]) { attempts.push(`storage.${method}`); return Reflect.apply(original, this, args); } });
    }
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => { attempts.push('indexedDB.open'); return Reflect.apply(open, indexedDB, args); }) as IDBFactory['open'];
    Object.defineProperty(window, 'ethereum', { configurable: true, get() { attempts.push('wallet.ethereum'); return undefined; } });
  });
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4412/')) unexpected.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByText('LOCAL TEST ONLY')).toBeVisible();
  await expect(page.locator('#balance')).not.toHaveText('—');
  const opening = Number(await page.locator('#balance').textContent());
  expect(opening).toBeGreaterThanOrEqual(20);
  await expect(page.getByRole('button', { name: 'Checkout unavailable in local test' })).toBeDisabled();
  await page.getByRole('button', { name: 'Load fictional example' }).first().click();
  await expect(page.locator('#input-preview')).toContainText('2 named holdings, 3 return dates');
  await page.getByRole('button', { name: 'Generate report · 10 credits' }).first().click();
  await expect(page.locator('#balance')).toHaveText(String(opening - 10));
  await expect(page.locator('#result-summary')).toContainText('Stress change: -80 USD');
  await page.getByRole('button', { name: 'Generate report · 10 credits' }).first().click();
  await expect(page.locator('#balance')).toHaveText(String(opening - 10));
  await expect(page.locator('#report-state')).toContainText('Exact retry');
  const jsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  expect((await jsonPromise).suggestedFilename()).toMatch(/\.json$/);
  await page.getByRole('tab', { name: 'Portfolio batch risk' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Trading journal advanced' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Load fictional example' }).last().click();
  await expect(page.locator('#input-preview')).toContainText('UTF-8 CSV bytes');
  await page.getByRole('button', { name: 'Generate report · 10 credits' }).last().click();
  await expect(page.locator('#balance')).toHaveText(String(opening - 20));
  await expect(page.locator('#result-summary')).toContainText('Net PnL: 35 USD');
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download spreadsheet-safe CSV' }).click();
  expect((await csvPromise).suggestedFilename()).toMatch(/\.csv$/);
  await page.locator('#journal-capital').fill('0');
  await page.getByRole('button', { name: 'Generate report · 10 credits' }).last().click();
  await expect(page.locator('#report-state')).toContainText('Starting capital must be positive');
  await expect(page.locator('#balance')).toHaveText(String(opening - 20));
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => (window as typeof window & { __pitAttempts?: string[] }).__pitAttempts)).toEqual([]);
  expect(context.pages()).toHaveLength(1);
});

test('mobile layout and anonymous access remain bounded', async ({ browser, page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Deeper answers/ })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 375);
  const anonymous = await browser.newContext();
  try {
    const response = await anonymous.request.get('http://127.0.0.1:4412/api/me');
    expect(response.status()).toBe(401);
    const forbidden = await anonymous.request.get('http://127.0.0.1:4412/api/checkout');
    expect(forbidden.status()).toBe(401);
  } finally { await anonymous.close(); }
});
