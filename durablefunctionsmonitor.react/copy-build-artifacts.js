// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const ncp = require('ncp').ncp;
const rimraf = require("rimraf");

const buildFolder = './build';

function copyBuildArtifacts(outputFolder) {

    rimraf.sync(`${outputFolder}/static/`);
    ncp(`${buildFolder}/static/`, `${outputFolder}/static/`);
    ncp(`${buildFolder}/manifest.json`, `${outputFolder}/manifest.json`);
    ncp(`${buildFolder}/service-worker.js`, `${outputFolder}/service-worker.js`);
    ncp(`${buildFolder}/favicon.png`, `${outputFolder}/favicon.png`);
    ncp(`${buildFolder}/logo.svg`, `${outputFolder}/logo.svg`);
    ncp(`${buildFolder}/index.html`, `${outputFolder}/index.html`);
}

copyBuildArtifacts('../durablefunctionsmonitor.dotnetbackend/DfmStatics');
copyBuildArtifacts('../durablefunctionsmonitor.dotnetisolated/DfmStatics');