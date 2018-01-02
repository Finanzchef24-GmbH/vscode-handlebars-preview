import * as barhandles from 'barhandles';
import * as bluebird from 'bluebird';
import * as fs from 'fs';
import * as path from 'path';
const fsAsync = bluebird.promisifyAll(fs)

async function parseAll(workspaceRoot: string) : Promise<any> {
    const templateFiles = await fsAsync.readdirAsync(path.join(workspaceRoot,'templates')).map((f) => path.join(workspaceRoot,'templates',f));
    const partialFiles = await fsAsync.readdirAsync(path.join(workspaceRoot,'partials')).map((f) => path.join(workspaceRoot,'partials',f));
    const files = templateFiles.concat(partialFiles).filter((file) => {
        return file.match(/\.hbs$/) || file.match(/\.handlebars$/)
    });
    const templates = await bluebird.map(files, (file) => fsAsync.readFileAsync(file, {encoding: 'utf-8'}));
    const schema = barhandles.extractSchema(templates.join(''));

    return schema;
}

export default parseAll