import { useState } from "react";
import { Editor, TextRenderer, type TextEditorContent } from "@frontlit/text-editor";
import "@frontlit/text-editor/styles.css";
import { sampleDoc } from "./sample-doc";

export function TextEditorDemo() {
  const [doc, setDoc] = useState<TextEditorContent>(sampleDoc);

  return (
    <div className="demo-stage demo-stage--scroll">
      <div className="text-demo">
        <section className="text-demo__pane">
          <header className="text-demo__label">
            <h2>Editor</h2>
            <p>WYSIWYG surface. JSON is emitted as you type.</p>
          </header>
          <Editor
            initialContent={sampleDoc}
            placeholder="Write something…"
            onChange={(json) => setDoc(json as TextEditorContent)}
            className="text-demo__editor"
          />
        </section>
        <section className="text-demo__pane">
          <header className="text-demo__label">
            <h2>TextRenderer</h2>
            <p>Static React from the same JSON. Updates after you pause typing.</p>
          </header>
          <div className="text-demo__render">
            <TextRenderer json={doc} />
          </div>
        </section>
      </div>
    </div>
  );
}
