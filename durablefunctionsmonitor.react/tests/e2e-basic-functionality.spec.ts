// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.setTimeout(120000);

const user = { email: process.env.DfMonPowerTester1Email!, pwd: process.env.DfMonPowerTester1Pwd! };

const instances = [
  process.env.DfMonTestE2EServerDirectedUrl!,
  process.env.DfMonTestE2EClientDirectedUrl!,
  process.env.DfMonTestE2EMsSqlUrl!,
  process.env.DfMonTestE2ENetheriteUrl!,
  process.env.DfMonTestE2EReadOnlyUrl!,
  process.env.DfMonTestE2EInjectedModeUrl!,
  process.env.DfMonTestE2EInjectedModeReadOnlyUrl!,
  process.env.DfMonTestE2EIsolatedUrl!,
  process.env.DfMonTestE2EIsolatedLinuxReadOnlyUrl!,
  process.env.DfMonTestE2EIsolatedInjectedModeReadOnlyUrl!,
  process.env.DfMonTestE2EIsolatedClientDirectedUrl!,
];

const instancesWithHistoryEventIdsSupported = [
  process.env.DfMonTestE2EServerDirectedUrl!,
  process.env.DfMonTestE2EMsSqlUrl!,
  process.env.DfMonTestE2EInjectedModeUrl!,
  process.env.DfMonTestE2EIsolatedUrl!,
  process.env.DfMonTestE2EIsolatedLinuxReadOnlyUrl!,
  process.env.DfMonTestE2EIsolatedInjectedModeReadOnlyUrl!,
  process.env.DfMonTestE2EIsolatedClientDirectedUrl!,
];

// Time Histogram tab should be rendered
for (const baseUri of instances) {
  
  test(`${baseUri}:time histogram tab is shown`, async ({ page }) => {
  
    await page.goto(baseUri);
    await login(page, user);

    // Navigating to a Task Hub, if needed
    try {
 
      const taskHubLink = await page.getByText('DurableFunctionsHub');
      await taskHubLink.waitFor({ timeout: 5000 });
      await taskHubLink.click();
      
    } catch {
      console.log(`List of Task Hubs wasn't shown`);
    }

    // switching to Time Histogram tab and changing the default time frame
    await page.goto(`${page.url().split('?')[0]}?tabIndex=1&timeFrom=2020-01-01T00%3A00%3A00.000Z`);
    
    // waiting till the load finishes
    await expect(page.getByText(/\[Show All\]/)).toBeEnabled({ timeout: 10 * 1000 });
  
    const itemsShownLabel = await page.getByText(/items shown/);
    const itemsShownLabelText = await itemsShownLabel.textContent();

    // something should be loaded at least
    expect(itemsShownLabelText).not.toBe("0 items shown");

    // diagram should be visible
    const diagramSvg = await page.locator('.rv-mouse-target');
    await expect(diagramSvg).toBeVisible();
  });
}

// Gantt Chart tab should be rendered
for (const baseUri of instances) {
  
  test(`${baseUri}:gantt chart tab is shown`, async ({ page }) => {
  
    await page.goto(baseUri);
    await login(page, user);

    // Navigating to a Task Hub, if needed
    try {
 
      const taskHubLink = await page.getByText('DurableFunctionsHub');
      await taskHubLink.waitFor({ timeout: 5000 });
      await taskHubLink.click();
      
    } catch {
      console.log(`List of Task Hubs wasn't shown`);
    }

    // switching to Gantt Chart tab and changing the default time frame
    await page.goto(`${page.url().split('?')[0]}?tabIndex=2&timeFrom=2020-01-01T00%3A00%3A00.000Z`);
    
    // waiting till the load finishes
    await expect(page.getByText(/\[Show All\]/)).toBeEnabled({ timeout: 10 * 1000 });
  
    const itemsShownLabel = await page.getByText(/instances shown/).nth(0);
    const itemsShownLabelText = await itemsShownLabel.textContent();

    // something should be loaded at least
    expect(itemsShownLabelText).not.toBe("0 instances shown");
  });
}

// Opening instance details page by typing instanceId
for (const baseUri of instances) {
  
  test(`${baseUri}:goto by instanceId works`, async ({ page }) => {
  
    await page.goto(baseUri);
    await login(page, user);

    // Navigating to a Task Hub, if needed
    try {
 
      const taskHubLink = await page.getByText('DurableFunctionsHub');
      await taskHubLink.waitFor({ timeout: 5000 });
      await taskHubLink.click();
      
    } catch {
      console.log(`List of Task Hubs wasn't shown`);
    }

    // changing the default time frame
    await page.goto(`${page.url().split('?')[0]}?timeFrom=2020-01-01T00%3A00%3A00.000Z`);
    
    // waiting till the load finishes
    await expect(page.getByText(/\[Show All\]/)).toBeEnabled({ timeout: 10 * 1000 });

    const instancePagePromise = page.waitForEvent('popup');

    // Getting first instance id
    const instanceLink = await page.locator('a').nth(2);
    const instanceId = await instanceLink.textContent();

    const instanceIdTextBox = await page.getByLabel('instanceId to go to...');
    await instanceIdTextBox.fill(instanceId!);
    await instanceIdTextBox.press('Enter');
    const instancePage = await instancePagePromise;
  
    // Checking that page's URL
    const instancePageUri = instancePage.url();
    expect(instancePageUri).toMatch(new RegExp(`/durable-instances/${instanceId}`));

    // Checking the details are loaded
    const executionHistoryLabel = await instancePage.getByText(/Execution History/);
    await expect(executionHistoryLabel).toBeVisible({ timeout: 10 * 1000 });
  });
}

// EventIds should be shown in the instance execution history table
for (const baseUri of instancesWithHistoryEventIdsSupported) {
  
  test(`${baseUri}:execution history eventIds are shown`, async ({ page }) => {
  
    await page.goto(baseUri);
    await login(page, user);

    // Navigating to a Task Hub, if needed
    try {
 
      const taskHubLink = await page.getByText('DurableFunctionsHub');
      await taskHubLink.waitFor({ timeout: 5000 });
      await taskHubLink.click();
      
    } catch {
      console.log(`List of Task Hubs wasn't shown`);
    }
  
    // changing the default time frame
    await page.goto(`${page.url().split('?')[0]}?timeFrom=2020-01-01T00%3A00%3A00.000Z`);
    
    // waiting till the load finishes
    await expect(page.getByText(/\[Show All\]/)).toBeEnabled({ timeout: 10 * 1000 });
    
    // Opening instance details page
    const instancePagePromise = page.waitForEvent('popup');
  
    const instanceLink = await page.locator('a').nth(2);
    const instanceId = await instanceLink.textContent();
  
    await instanceLink.click();
    const instancePage = await instancePagePromise;
  
    // Checking that page's URL
    const instancePageUri = instancePage.url();
    expect(instancePageUri).toMatch(new RegExp(`/durable-instances/${instanceId}`));

    // Filtering by EventId column
    await instancePage.getByRole('button', { name: '[Not Selected]' }).click();
    await instancePage.getByRole('option', { name: 'EventId' }).click();
    await instancePage.getByPlaceholder('[some text or \'null\']').click();
    await instancePage.getByPlaceholder('[some text or \'null\']').fill('1');
    await instancePage.getByPlaceholder('[some text or \'null\']').press('Enter');
  
    // History table should now contain just one row
    const executionHistoryLabel = await instancePage.getByText('Execution History (1 items shown, filtered)');
    await expect(executionHistoryLabel).toBeVisible();
  });
}