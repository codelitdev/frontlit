import { lowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

lowlight.registerLanguage("javascript", javascript);
lowlight.registerLanguage("typescript", typescript);
lowlight.registerLanguage("json", json);
lowlight.registerLanguage("css", css);
lowlight.registerLanguage("html", xml);

export { lowlight };
