// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';

import { ConnStringUtils } from '../../ConnStringUtils';

suite('ConnStringUtils Test Suite', () => {

	test('Returns AccountName', async () => {

		// Arrange
		const connString1 = `AccountName=mystorageaccount1;AccountKey=12345;DefaultEndpointsProtocol=http;`;
		const connString2 = `AccountKey=12345;DefaultEndpointsProtocol=https;accounTName=mystorageaccount2;`;
		const connString3 = `AccountKey=12345;DefaultEndpointsProtocol=https;accounTName=mystorageaccount3`;
		const connString4 = `AccountKey=12345;DefaultEndpointsProtocol=http;`;

		// Act
		const res1 = ConnStringUtils.GetAccountName(connString1);
		const res2 = ConnStringUtils.GetAccountName(connString2);
		const res3 = ConnStringUtils.GetAccountName(connString3);
		const res4 = ConnStringUtils.GetAccountName(connString4);

		// Assert

		assert.strictEqual(res1, 'mystorageaccount1');
		assert.strictEqual(res2, 'mystorageaccount2');
		assert.strictEqual(res3, 'mystorageaccount3');
		assert.strictEqual(res4, '');

	});

	test('Returns AccountKey', async () => {

		// Arrange
		const connString1 = `AccountName=mystorageaccount1;DefaultEndpointsProtocol=http;AccountKey=1234-my-account-key-567;`;
		const connString2 = `AccountName=mystorageaccount1;DefaultEndpointsProtocol=http;AccountKey=890-my-account-key-123`;
		const connString3 = `acCountKeY=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;accounTName=mystorageaccount2;DefaultEndpointsProtocol=https;`;
		const connString4 = `AccountName=mystorageaccount2;DefaultEndpointsProtocol=http;`;

		// Act
		const res1 = ConnStringUtils.GetAccountKey(connString1);
		const res2 = ConnStringUtils.GetAccountKey(connString2);
		const res3 = ConnStringUtils.GetAccountKey(connString3);
		const res4 = ConnStringUtils.GetAccountKey(connString4);

		// Assert

		assert.strictEqual(res1, '1234-my-account-key-567');
		assert.strictEqual(res2, '890-my-account-key-123');
		assert.strictEqual(res3, 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==');
		assert.strictEqual(res4, '');

	});

	test('Returns DefaultEndpointsProtocol', async () => {

		// Arrange
		const connString1 = `DefaultEndpointsProtocol=http;AccountName=mystorageaccount1;AccountKey=12345;`;
		const connString2 = `AccountKey=12345;accounTName=mystorageaccount2;defaulTendpointsProtocol=https;`;
		const connString3 = `AccountKey=12345;accounTName=mystorageaccount2;defaulTendpointsProtocol=http`;
		const connString4 = `AccountKey=12345;AccountName=mystorageaccount1;`;

		// Act
		const res1 = ConnStringUtils.GetDefaultEndpointsProtocol(connString1);
		const res2 = ConnStringUtils.GetDefaultEndpointsProtocol(connString2);
		const res3 = ConnStringUtils.GetDefaultEndpointsProtocol(connString3);
		const res4 = ConnStringUtils.GetDefaultEndpointsProtocol(connString4);

		// Assert

		assert.strictEqual(res1, 'http');
		assert.strictEqual(res2, 'https');
		assert.strictEqual(res3, 'http');
		assert.strictEqual(res4, 'https');

	});

	test('Returns TableEndpoint', async () => {

		// Arrange
		const connString1 = `DefaultEndpointsProtocol=http;AccountKey=12345;`;
		const connString2 = `AccountKey=12345;accounTName=mystorageaccount2;defaulTendpointsProtocol=https;EndpointSuffix=some.other.endpoint`;
		const connString3 = `AccountKey=12345;accounTName=mystorageaccount2;TableendpoinT=http://123.45.67.89:123456/mystorageaccount1;defaulTendpointsProtocol=http`;
		const connString4 = `AccountKey=12345;AccountName=mystorageaccount1;`;

		// Act
		const res1 = ConnStringUtils.GetTableEndpoint(connString1);
		const res2 = ConnStringUtils.GetTableEndpoint(connString2);
		const res3 = ConnStringUtils.GetTableEndpoint(connString3);
		const res4 = ConnStringUtils.GetTableEndpoint(connString4);

		// Assert

		assert.strictEqual(res1, '');
		assert.strictEqual(res2, 'https://mystorageaccount2.table.some.other.endpoint/');
		assert.strictEqual(res3, 'http://123.45.67.89:123456/mystorageaccount1');
		assert.strictEqual(res4, 'https://mystorageaccount1.table.core.windows.net/');

	});

	test('Expands emulator shortcut if needed', async () => {

		// Arrange
		const connString1 = `UseDevelopmentStorage=true;`;
		const connString2 = `AccountKey=12345;accounTName=mystorageaccount2;defaulTendpointsProtocol=https;`;

		// Act
		const res1 = ConnStringUtils.ExpandEmulatorShortcutIfNeeded(connString1);
		const res2 = ConnStringUtils.ExpandEmulatorShortcutIfNeeded(connString2);

		// Assert

		assert.strictEqual(res1, 'AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;DefaultEndpointsProtocol=http;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;');
		assert.strictEqual(res2, connString2);

	});

	test('Returns storage name', async () => {

		// Arrange
		const connString1 = `Data Source=my-sql-server;Initial Catalog=my-database;Integrated Security=True`;
		const connString2 = `AccountKey=12345;accounTName=mystorageaccount3;defaulTendpointsProtocol=https;`;

		// Act
		const res1 = ConnStringUtils.GetStorageName([connString1]);
		const res2 = ConnStringUtils.GetStorageName([connString2]);

		// Assert

		assert.strictEqual(res1, `my-sql-server/my-database`);
		assert.strictEqual(res2, `mystorageaccount3`);

	});

});
