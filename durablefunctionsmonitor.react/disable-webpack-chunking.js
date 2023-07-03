const fs = require('fs');
const path = require('path');

const webpackConfigJsPath = path.join(`node_modules`, `react-scripts`, `config`, `webpack.config.js`);
let webpackConfigJs = fs.readFileSync(webpackConfigJsPath, { encoding: 'utf8' });

if (!webpackConfigJs.includes('LimitChunkCountPlugin')) {

    const limitChunkCountPluginConfig = `   new webpack.optimize.LimitChunkCountPlugin({ maxChunks:1 })\n    `;

    webpackConfigJs = webpackConfigJs.replace(

        /].filter\(Boolean\),[^}]+};\s};\s$/,
        `${limitChunkCountPluginConfig}$&`
    );

    fs.writeFileSync(webpackConfigJsPath, webpackConfigJs);
}