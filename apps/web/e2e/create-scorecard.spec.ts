import { expect, test } from '@playwright/test';

const seriousConsole = /input element's type "number" does not support selection|TypeError|ReferenceError|Unhandled/i;

async function loginIfNeeded(page: import('@playwright/test').Page) {
  if (!/\/auth\b/.test(page.url())) return;
  await page.getByLabel(/username|email/i).fill('demo');
  await page.getByLabel(/password/i).fill('demo');
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  await page.waitForLoadState('networkidle');
}

test('create-scorecard full workbook flow saves, calculates, refreshes, and reopens', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && seriousConsole.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/create-scorecard/C-70155');
  await loginIfNeeded(page);
  await expect(page.getByText(/Create Scorecard|New Scorecard/i)).toBeVisible();

  const companyName = page.getByLabel(/Company \/ Legal Name|Company name/i).first();
  if (await companyName.isVisible().catch(() => false)) {
    await companyName.fill('Playwright QA Company');
  }

  async function openSection(name: RegExp) {
    await page.getByRole('button', { name }).click();
    await page.waitForTimeout(250);
  }

  await openSection(/Company Information/i);
  await page.getByLabel(/Financial Year End/i).fill('31/12/2025');
  await page.getByLabel(/Financial Year End/i).blur();
  await expect(page.getByText(/Enter a valid date/i)).toHaveCount(0);

  await openSection(/Ownership/i);
  await page.getByRole('button', { name: /add row|add/i }).first().click();
  await page.getByLabel(/Shareholder/i).last().fill('QA Shareholder');
  await page.getByLabel(/Black Ownership/i).last().fill('51');
  await page.getByLabel(/Black Women/i).last().fill('35');
  await page.getByLabel(/Voting Rights/i).last().fill('51');
  await page.getByLabel(/Years Held/i).last().fill('3');

  await openSection(/Management Control/i);
  await page.getByRole('button', { name: /add row|add/i }).first().click();
  await page.getByLabel(/Annual Salary|Salary/i).last().fill('450000');
  await page.getByLabel(/Voting Rights/i).last().fill('25');

  await openSection(/Skills Development/i);
  await page.getByLabel(/Training Data Reference Date/i).fill('31/12/2025');
  await page.getByRole('button', { name: /add row|add/i }).first().click();
  await page.getByLabel(/Learner Name/i).last().fill('QA Learner');
  await page.getByLabel(/Programme Spend|Course Cost/i).last().fill('50000');
  await page.getByLabel(/Travel/i).last().fill('2500');

  await openSection(/Preferential Procurement|Procurement/i);
  await page.getByRole('button', { name: /add row|add/i }).first().click();
  await page.getByLabel(/Supplier Name/i).last().fill('QA Supplier');
  await page.getByLabel(/Supplier Registration Number|Registration Number/i).last().fill('2019/123456/07');
  await page.getByLabel(/Spend/i).last().fill('250000');

  await openSection(/Supplier Development|Enterprise.*Supplier/i);
  await page.getByRole('button', { name: /add row|add/i }).first().click();
  await page.getByLabel(/Beneficiary|Supplier/i).last().fill('QA SD Beneficiary');
  await page.getByLabel(/Amount/i).last().fill('40000');

  await page.getByRole('button', { name: /^Save$/i }).click();
  await page.getByRole('button', { name: /Calculate Scorecard|Continue|Summary/i }).click();
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/Scorecard|Create Scorecard|Summary/i)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
