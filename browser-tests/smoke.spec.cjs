const { test, expect } = require('@playwright/test');
async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator('#send')).toBeEnabled();
}
async function projects(page, method = 'GET') {
  return page.evaluate(async method => {
    const response = await fetch('./__demo/projects', {
      method, headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({ name: 'Browser smoke' }) } : {}),
    });
    return response.json();
  }, method);
}
test('worker readiness, guided challenge and saved progress', async ({ page }) => {
  await ready(page);
  await page.locator('[data-challenge="address"]').click();
  await page.locator('#url').fill('demo://api/users/1');
  await page.locator('#send').click();
  await expect(page.locator('#progress')).toContainText('1 / 15');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator('#progress')).toContainText('1 / 15');
});
test('tab isolation, reset and reload', async ({ page, context }) => {
  await ready(page);
  const other = await context.newPage();
  await ready(other);
  await projects(page, 'POST');
  expect((await projects(page)).projects).toHaveLength(1);
  expect((await projects(other)).projects).toHaveLength(0);
  await page.locator('#resetDemo').click();
  await expect.poll(async () => (await projects(page)).projects.length).toBe(0);
  await projects(page, 'POST');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect.poll(async () => (await projects(page)).projects.length).toBe(0);
});
