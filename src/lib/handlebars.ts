const handlebars = require('handlebars'),
    vscode = require('vscode'),
    path = require('path');

const partialsGlob = vscode.workspace.getConfiguration('handlebarsPreview').get('partialsGlob'),
    helpersFile = vscode.workspace.getConfiguration('handlebarsPreview').get('helpersGlob');

vscode.workspace.findFiles(helpersFile).then(files => files.map(file => {
    const helpers = require(file.fsPath);

    Object.keys(helpers).forEach(function(helperName) {
        handlebars.registerHelper(helperName, helpers[helperName] );
    });
}))

function registerPartial(partial) {
    const name = path.basename(partial.fileName, '.hbs');
    handlebars.registerPartial(name, partial.getText());
}

function unregisterPartial(filePath) {
    const partialName = path.basename(filePath, '.hbs');

    handlebars.unregisterPartial(partialName);
}

function findPartials(partialsGlob) {
    return vscode.workspace.findFiles(partialsGlob).then(files =>
        Promise.all(files.map(file => vscode.workspace.openTextDocument(file).then(registerPartial))))
        .then(() => partialsGlob);
}

function watchPartials(partialsGlob) {
    const partialWatcher = vscode.workspace.createFileSystemWatcher(partialsGlob);
    partialWatcher.onDidCreate(uri => {
        vscode.workspace.openTextDocument(uri).then(registerPartial);
    });
    partialWatcher.onDidChange(uri => {
        vscode.workspace.openTextDocument(uri).then((document) => {
            unregisterPartial(uri.fsPath);
            registerPartial(document);
        });
    });
    partialWatcher.onDidDelete(({fsPath}) => {
        unregisterPartial(fsPath);
    });
}

function getHandlebarsInstance() {
    return findPartials(partialsGlob).then(watchPartials).then(() => handlebars);
}

export default getHandlebarsInstance;
