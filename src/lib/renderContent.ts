import getHandlebarsInstance from "./handlebars";

export default async (templateSource, dataSource): Promise<string> => {
    if (!templateSource) {
        return "<body>Select document to render</body>";
    }

    try {
        const handlebars = await getHandlebarsInstance();
        let data = JSON.parse(dataSource || "{}");
        let template = handlebars.compile(templateSource);
        return template(data);
    } catch (ex) {
        return `
            <body>
                <h2>Error occured</h2>
                <pre>${ex}</pre>
            </body>
        `;
    }
}