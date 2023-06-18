import { test, expect, Page } from '@playwright/test';

test.setTimeout(120000);

type TestUser = { email: string, pwd: string };

const users = {
  powerUser: { email: process.env.DfMonPowerTester1Email!, pwd: process.env.DfMonPowerTester1Pwd! },
  rejectedUser: { email: process.env.DfMonRejectedTester1Email!, pwd: process.env.DfMonRejectedTester1Pwd! },
  readOnlyUser: { email: process.env.DfMonReadonlyTester1Email!, pwd: process.env.DfMonReadonlyTester1Pwd! },
};

const baseUris = [process.env.DfMonTestE2EServerDirectedUrl!, process.env.DfMonTestE2EClientDirectedUrl!];

for (const baseUri of baseUris) {
  
  const user = users.powerUser;

  test(`${baseUri}:${user.email}:login successful`, async ({ page }) => {
  
    await page.goto(baseUri);
  
    await login(page, user);
    
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

    // Checking the details are loaded
    const executionHistoryLabel = await instancePage.getByText(/Execution History/);
    await expect(executionHistoryLabel).toBeVisible();

    // Checking that buttons are enabled
    const setCustomStatusButton = await instancePage.getByText(/set custom status/i);
    await expect(setCustomStatusButton).toBeEnabled();
  });
}

for (const baseUri of baseUris) {
  
  const user = users.readOnlyUser;

  test(`${baseUri}:${user.email}:login successful, but UI is read-only`, async ({ page }) => {
  
    await page.goto(baseUri);
  
    await login(page, user);
    
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

    // Checking the details are loaded
    const executionHistoryLabel = await instancePage.getByText(/Execution History/);
    await expect(executionHistoryLabel).toBeVisible();

    // Checking that buttons are disabled
    const setCustomStatusButton = await instancePage.getByText(/set custom status/i);
    await expect(setCustomStatusButton).toBeDisabled();
  });
}

for (const baseUri of baseUris) {

  const user = users.rejectedUser;
  
  test(`${baseUri}:${user.email}:login fails`, async ({ page }) => {
  
    await page.goto(baseUri);
  
    await login(page, user);

    // An error message should be displayed
    const errorMessageLabel = await page.getByText(/Login failed/);
    await expect(errorMessageLabel).toBeVisible();

    const errorMessageLabelText = await errorMessageLabel.textContent();
    expect(errorMessageLabelText).toBe(`Login failed. Failed to load the list of Task Hubs. Request failed with status code 401`);
  });
}

for (const baseUri of baseUris) {

  const user = users.powerUser;
  
  test(`${baseUri}:${user.email}:non-existent task hub results in an error`, async ({ page }) => {
  
    await page.goto(baseUri + '/taskhubthatshouldnotbe');
  
    await login(page, user);

    // An error message should be displayed
    const errorMessageLabel = await page.getByText(/Failed to get user permissions/);
    await expect(errorMessageLabel).toBeVisible();

    const errorMessageLabelText = await errorMessageLabel.textContent();
    expect(errorMessageLabelText).toBe(`Failed to get user permissions. Request failed with status code 401`);
  });
}

for (const baseUri of baseUris) {

  const user = users.rejectedUser;
  
  test(`${baseUri}:${user.email}:non-existent task hub results in an error`, async ({ page }) => {
  
    await page.goto(baseUri + '/taskhubthatshouldnotbe');
  
    await login(page, user);

    // An error message should be displayed
    const errorMessageLabel = await page.getByText(/Failed to get user permissions/);
    await expect(errorMessageLabel).toBeVisible();

    const errorMessageLabelText = await errorMessageLabel.textContent();
    expect(errorMessageLabelText).toBe(`Failed to get user permissions. Request failed with status code 401`);
  });
}

async function login(page: Page, user: TestUser) {

  await page.getByRole('textbox').fill(user.email);
  await page.getByRole('button', { name: 'Next' }).click();

  const passwordInput = page.locator(`//input[@type='password']`);
  await passwordInput.fill(user.pwd);
  await page.getByRole('button', { name: 'Sign in' }).click();

  try {

    const stayLoggedInButton = page.getByRole('button', { name: 'No' });
    await stayLoggedInButton.waitFor({ timeout: 5000 });
    await stayLoggedInButton.click();

  } catch {
    console.log(`There was no 'Stay logged in' option on the login page`);
  }

  try {

    const stayLoggedInButton = page.getByRole('button', { name: 'Accept' });
    await stayLoggedInButton.waitFor({ timeout: 5000 });
    await stayLoggedInButton.click();

  } catch {
    console.log(`There was no consent dialog`);
  }
}
