// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.setTimeout(120000);

const users = {
  powerUser: { email: process.env.DfMonPowerTester1Email!, pwd: process.env.DfMonPowerTester1Pwd! },
  rejectedUser: { email: process.env.DfMonRejectedTester1Email!, pwd: process.env.DfMonRejectedTester1Pwd! },
  readOnlyUser: { email: process.env.DfMonReadonlyTester1Email!, pwd: process.env.DfMonReadonlyTester1Pwd! },
};

const instanceWithAuthNotConfigured = process.env.DfMonTestE2ENoEasyAuthUrl!;

const instances = [
  process.env.DfMonTestE2EServerDirectedUrl!,
  process.env.DfMonTestE2EClientDirectedUrl!,
  process.env.DfMonTestE2EMsSqlUrl!,
  process.env.DfMonTestE2ENetheriteUrl!,
  process.env.DfMonTestE2EReadOnlyUrl!,
  process.env.DfMonTestE2EInjectedModeUrl!,
  process.env.DfMonTestE2EInjectedModeReadOnlyUrl!,
];

const readOnlyInstances = [
  process.env.DfMonTestE2EReadOnlyUrl!,
  process.env.DfMonTestE2EInjectedModeReadOnlyUrl!,
];

const instancesWithOnlyOneAvailableTaskHub = [
  process.env.DfMonTestE2EMsSqlUrl!,
  process.env.DfMonTestE2ENetheriteUrl!,
];

// Instance with EasyAuth not configured should deny any access
test(`${instanceWithAuthNotConfigured}:EasyAuth not configured:login fails`, async ({ page }) => {
  
  await page.goto(instanceWithAuthNotConfigured);

  // An error message should be displayed
  const errorMessageLabel = await page.getByText(/Login failed/);
  await expect(errorMessageLabel).toBeVisible();

  const errorMessageLabelText = await errorMessageLabel.textContent();
  expect(errorMessageLabelText).toBe(`Login failed. Failed to load auth config. Request failed with status code 401`);
});

// Basic login flow and opening instance details in a separate tab
for (const baseUri of instances) {
  
  const user = users.powerUser;

  test(`${baseUri}:${user.email}:login successful`, async ({ page }) => {
  
    await page.goto(baseUri);
  
    await login(page, user);

    // When Task Hub is predefined, the UI should automatically redirect itself to it
    if (!instancesWithOnlyOneAvailableTaskHub.includes(baseUri)) {
      
      // Otherwise selecting a task hub
      await page.getByText('DurableFunctionsHub').click();
    }
  
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

    // Checking the buttons
    const setCustomStatusButton = await instancePage.getByText(/set custom status/i);

    if (readOnlyInstances.includes(baseUri)) {
      
      await expect(setCustomStatusButton).toBeDisabled();

    } else {

      await expect(setCustomStatusButton).toBeEnabled();
    }
  });
}

// Instance management buttons should be disabled for a read-only user
for (const baseUri of instances) {
  
  const user = users.readOnlyUser;

  test(`${baseUri}:${user.email}:login successful, but UI is read-only`, async ({ page, context }) => {
  
    await page.goto(baseUri);
  
    await login(page, user);
    
    // When Task Hub is predefined, the UI should automatically redirect itself to it
    if (!instancesWithOnlyOneAvailableTaskHub.includes(baseUri)) {
      
      // Otherwise selecting a task hub
      await page.getByText('DurableFunctionsHub').click();
    }
  
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

    // Checking that API method returns 401 or 403
    const response = await page.request.post(`${baseUri}/a/p/i/--DurableFunctionsHub/orchestrations('${instanceId}')/suspend`);

    expect(response.status() === 401 || response.status() === 403).toBeTruthy();
  });
}

// Arbitrary user should not be allowed in
for (const baseUri of instances) {

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

// Non-existent or invalid Task Hub should not be allowed
for (const baseUri of instances) {

  for (const user of [users.powerUser, users.rejectedUser]) {

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
}
