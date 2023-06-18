import { test, expect, Page } from '@playwright/test';

test.setTimeout(60000);

async function login(page: Page, email: string, pwd: string) {

  await page.getByRole('textbox').fill(email);
  await page.getByRole('button', { name: 'Next' }).click();

  const passwordInput = page.locator(`//input[@type='password']`);
  await passwordInput.fill(pwd);
  await page.getByRole('button', { name: 'Sign in' }).click();

  try {

    const stayLoggedInButton = page.getByRole('button', { name: 'No' });
    await stayLoggedInButton.waitFor({ timeout: 5000 });
    await stayLoggedInButton.click();

  } catch {
    console.log(`There was no 'Stay logged in' option on the login page`);
  }
}

test('PowerTester1 - login successful', async ({ page }) => {
  
  await page.goto(process.env.DfMonTestE2EServerDirectedUrl!);

  await login(page, process.env.DfMonPowerTester1Email!, process.env.DfMonPowerTester1Pwd!);
  
  // selecting a task hub
  await page.getByText('DurableFunctionsHub').click();

  // changing the default time frame
  const fromTextBox = await page.getByRole('textbox').nth(1);
  await fromTextBox.fill('2020-01-01 12:00:00');
  await fromTextBox.press('Enter');

  const itemsShownLabel = await page.getByText(/items shown/);

  // waiting till the load finishes
  await expect(fromTextBox).toBeEnabled();

  const itemsShownLabelText = await itemsShownLabel.textContent();

  // Something should be loaded at least
  expect(itemsShownLabelText).not.toBe("0 items shown");

  // Opening instance details page
  const instancePagePromise = page.waitForEvent('popup');

  const instanceLink = await page.locator('a').nth(2);
  const instanceId = await instanceLink.textContent();

  await instanceLink.click();
  const instancePage = await instancePagePromise;

  // Checking that page's URL
  const instancePageUri = instancePage.url();
  expect(instancePageUri).toMatch(new RegExp(`/durable-instances/${instanceId}`));
});