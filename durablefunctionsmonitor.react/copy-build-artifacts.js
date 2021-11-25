const ncp = require('ncp').ncp;
const rimraf = require("rimraf");

const buildFolder = './build';
const outputFolder = '../durablefunctionsmonitor.dotnetbackend/DfmStatics';

rimraf.sync(`${outputFolder}/static/`);
ncp(`${buildFolder}/static/`, `${outputFolder}/static/`);
ncp(`${buildFolder}/manifest.json`, `${outputFolder}/manifest.json`);
ncp(`${buildFolder}/service-worker.js`, `${outputFolder}/service-worker.js`);
ncp(`${buildFolder}/favicon.png`, `${outputFolder}/favicon.png`);
ncp(`${buildFolder}/logo.svg`, `${outputFolder}/logo.svg`);
ncp(`${buildFolder}/index.html`, `${outputFolder}/index.html`);