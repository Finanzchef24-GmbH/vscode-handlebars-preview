const barhandles = require('barhandles');
const bluebird = require('bluebird');
const fs = bluebird.promisifyAll(require('fs'));
const path = require('path')

async function parseAll(workspaceRoot: string) : Promise<any> {
    let templateFiles = await fs.readdirAsync(path.join(workspaceRoot,'templates')).map((f) => path.join(workspaceRoot,'templates',f));
    let partialFiles = await fs.readdirAsync(path.join(workspaceRoot,'partials')).map((f) => path.join(workspaceRoot,'partials',f));
    let files = templateFiles.concat(partialFiles).filter((file) => {
        return file.match(/\.hbs$/) || file.match(/\.handlebars$/)
    });
    let templates = await bluebird.map(files, (file) => fs.readFileAsync(file, {encoding: 'utf-8'}));
    let schema = barhandles.extractSchema(templates.join(''));

    return schema;
}

export default parseAll