// Checks that a local.settings.json file exists in local folder.
// If not, asks the user to specify the Azure Storage connection string and creates the file.
// Then runs func start

const fs = require('fs');
const { spawn } = require('child_process');

function funcStart() {
    spawn('func', ['start'], { shell: true, stdio: 'inherit' });
    spawn('start', ['http://localhost:7072'], {shell: true});
}

if (fs.existsSync('./local.settings.json')) {
    console.log('An existing ./local.settings.json file found in local folder. Connection parameters initialization skipped.');

    funcStart();
    return;
}

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
})

console.log(`About to create local.settings.json file and put connection parameters into it...`);

readline.question(`Your Azure Storage Connection String: `, (connectionString) => {
    
    if (!connectionString) {
        console.log(`No Connection String provided, cannot create the local.settings.json file. The app might not work.`);
        readline.close()
        return;
    }

    readline.question(`(optional) Comma-separated list of allowed Task Hubs: `, (hubNames) => {
        readline.close()

        const localSettings = {
            IsEncrypted: false,
            Values: {
                AzureWebJobsStorage: connectionString,
                DFM_NONCE: "i_sure_know_what_i_am_doing",
                FUNCTIONS_WORKER_RUNTIME: "dotnet"
            },
            Host: {
                LocalHttpPort: 7072,
                CORS: "http://127.0.0.1:7072,http://localhost:3000,http://127.0.0.1:3000",
                CORSCredentials: true
            }
        }

        if (!!hubNames) {
            localSettings.Values.DFM_HUB_NAME = hubNames;
        }

        fs.writeFileSync('local.settings.json', JSON.stringify(localSettings, null, 4));
        console.log(`A local.settings.json file was created successfully. You can use the UI menu button to change connection parameters later on.`);
        console.warn('\x1b[33m%s\x1b[0m', `WARNING: no authentication out-of-the-box! Please, protect your DFM endpoint as appropriate.`);

        if (!hubNames) {
            console.warn('\x1b[33m%s\x1b[0m', `WARNING: you did not provide the list of allowed Task Hubs, so this instance will allow to access ALL Task Hubs in the Storage Account.`);
        }

        funcStart();
    });
})