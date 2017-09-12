'use strict';

const Promise = require('bluebird'),
    chokidar = require('chokidar'),
    fs = require('fs'),
    glob = require('glob'),
    path = require('path');

import handlebars from './handlebars';

function readPartial(filePath) {
    return Promise.promisify(fs.readFile, fs)(filePath).then(data => {
        return { filePath, data };
    });
}

function registerPartial(partial) {
  const name = path.basename(partial.filePath, '.hbs');
  
  handlebars.registerPartial(name, partial.data.toString('utf8'));
}

function unregisterPartial(filePath) {
  const partialName = path.basename(filePath, '.hbs');
  
  handlebars.unregisterPartial(partialName);
}

function findPartials(partialsPath) {
    return Promise.promisify(glob)(`${ partialsPath }/**/*.hbs`)
        .then(files => {
            return Promise.all(files.map(readPartial)).then(partials => {
                partials.forEach(registerPartial);
            });
        });
}

function watchPartials(partialsPath) {
  chokidar.watch(`${ partialsPath }/**/*.hbs`).on('add', (filePath) => {
     readPartial(filePath).then(partial => {
        registerPartial(partial);
     })
  }).on('change', (filePath) => {
    readPartial(filePath).then(partial => {
        unregisterPartial(filePath);
        registerPartial(partial);   
    });
  }).on('unlink', filePath => {
    unregisterPartial(filePath);
  });
}

function loadPartials(partialsPath) {
  return findPartials(partialsPath).then(() => {
    watchPartials(partialsPath);
  })
}

export default loadPartials;