"use client";

import { useState } from "react";
import {
  Editor,
  TextRenderer,
  emptyDoc,
  type TextEditorContent,
} from "@frontlit/text-editor";

export function TextEditorDemo() {
  const [doc, setDoc] = useState<TextEditorContent>(emptyDoc);

  return (
    <div className="page-builder-demo">
      <div className="page-builder-demo__header">
        <h3>Editor</h3>
        <p>The WYSIWYG surface and the static renderer, using the same TipTap JSON.</p>
      </div>
      <div className="page-builder-demo__body">
        <div className="grid gap-4 md:grid-cols-2">
          <Editor
            initialContent={emptyDoc}
            placeholder="Write something…"
            onChange={(json) => setDoc(json as TextEditorContent)}
          />
          <div className="rounded-md border p-4">
            <TextRenderer json={doc} />
          </div>
        </div>
      </div>
    </div>
  );
}
