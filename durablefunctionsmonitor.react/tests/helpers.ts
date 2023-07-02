// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Page } from '@playwright/test';

export type TestUser = { email: string, pwd: string };

export async function login(page: Page, user: TestUser) {

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
  