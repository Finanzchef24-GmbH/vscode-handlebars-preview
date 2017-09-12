const handlebars = require('handlebars'),
    vscode = require('vscode');

import partialWatcher from './partials-watcher';

const partialsDirectory = vscode.workspace.getConfiguration('handlebarsPreview').get('partialsDirectory'),
    helpersFile = vscode.workspace.getConfiguration('handlebarsPreview').get('helpersFile'),
    helpers = require(helpersFile);

Object.keys(helpers).forEach(function(helperName) {
    handlebars.registerHelper(helperName, helpers[helperName] );
});

partialWatcher(partialsDirectory);

export default handlebars;