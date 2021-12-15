import { ESLint } from "eslint";

export const run = async () => {
    const eslint = new ESLint();

    const results = await eslint.lintFiles(["output/**/*.tsx"]);

    const formatter = await eslint.loadFormatter("stylish");
    const resultText = formatter.format(results);

    console.log(resultText);
};
