import fs from "node:fs";

const file = "dist/styles.css";
const css = fs.readFileSync(file, "utf8");
fs.writeFileSync(file, css.replaceAll("../fonts/", "./fonts/"));
