const path = require("node:path");

const GENERATED_DIRS = [
  path.join("apps", "docs", ".source"),
  path.join("packages", "page-builder", "schema"),
].map((dir) => `${dir}${path.sep}`);
const PRETTIER_EXTENSIONS = /\.(ts|tsx|js|mjs|css|md|json)$/;
const ESLINT_EXTENSIONS = /\.(ts|tsx)$/;

const quote = (file) => JSON.stringify(file);

module.exports = (files) => {
  const eligibleFiles = files.filter(
    (file) =>
      !GENERATED_DIRS.some((dir) => path.relative(process.cwd(), file).startsWith(dir)),
  );

  const biomeFiles = eligibleFiles.filter((file) => PRETTIER_EXTENSIONS.test(file));
  const eslintFiles = eligibleFiles.filter((file) => ESLINT_EXTENSIONS.test(file));

  return [
    biomeFiles.length > 0 && `biome format --write --no-errors-on-unmatched ${biomeFiles.map(quote).join(" ")}`,
    eslintFiles.length > 0 &&
      `eslint --quiet --cache --fix ${eslintFiles.map(quote).join(" ")}`,
  ].filter(Boolean);
};
