"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const COPIED_ATTR = "data-pb-preview-style";

const THEME_FONT_VARS = [
    "--font-sans",
    "--font-mono",
    "--font-inter",
    "--font-open-sans",
    "--font-source-sans-3",
    "--font-noto-sans",
    "--font-roboto",
    "--font-mulish",
    "--font-nunito",
    "--font-work-sans",
    "--font-merriweather",
    "--font-alegreya",
    "--font-playfair-display",
    "--font-roboto-slab",
    "--font-source-serif-4",
    "--font-montserrat",
    "--font-poppins",
    "--font-raleway",
    "--font-rubik",
    "--font-oswald",
    "--font-bebas-neue",
    "--font-lato",
    "--font-pt-sans",
    "--font-quicksand",
];

function readCssVar(sourceDoc: Document, name: string): string {
    const view = sourceDoc.defaultView;
    if (!view) return "";
    const html = view
        .getComputedStyle(sourceDoc.documentElement)
        .getPropertyValue(name)
        .trim();
    if (html) return html;
    return view.getComputedStyle(sourceDoc.body).getPropertyValue(name).trim();
}

/**
 * next/font sets --font-* on the host layout, not inside the iframe. Copy
 * those variables so `font-inter` etc. resolve to the same faces as the host.
 */
function syncFontVariables(sourceDoc: Document, targetDoc: Document) {
    const root = targetDoc.documentElement;
    for (const name of THEME_FONT_VARS) {
        const value = readCssVar(sourceDoc, name);
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
    }
}

/**
 * Mirrors the parent document's stylesheets into the iframe so Tailwind
 * utilities (and next/font @font-face rules) apply to the portaled canvas.
 */
function syncStyles(sourceDoc: Document, targetDoc: Document) {
    targetDoc.head
        .querySelectorAll(`[${COPIED_ATTR}]`)
        .forEach((node) => node.remove());
    sourceDoc
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((node) => {
            const clone = node.cloneNode(true) as HTMLElement;
            clone.setAttribute(COPIED_ATTR, "");
            targetDoc.head.appendChild(clone);
        });
    syncFontVariables(sourceDoc, targetDoc);
}

/**
 * Renders children inside a same-origin iframe via a React portal. Unlike a
 * width-constrained div, the iframe is its own viewport, so `md:`/`lg:`
 * media queries respond to the frame's width — giving a faithful device
 * preview. Interactivity is preserved: React attaches event listeners to
 * the portal container, so clicks and hovers inside the frame work as usual.
 */
export function PreviewFrame({
    className,
    title = "Page preview",
    children,
}: {
    className?: string;
    title?: string;
    children: React.ReactNode;
}) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        let observer: MutationObserver | undefined;

        const init = () => {
            const doc = iframe.contentDocument;
            if (!doc) return;
            if (!doc.getElementById("pb-preview-base")) {
                const base = doc.createElement("style");
                base.id = "pb-preview-base";
                base.textContent = "html,body{margin:0;height:100%;}";
                doc.head.appendChild(base);
            }
            syncStyles(document, doc);
            // Re-sync when the host app adds/updates styles (route
            // transitions, dev-mode HMR, lazily loaded chunks).
            observer?.disconnect();
            observer = new MutationObserver(() => syncStyles(document, doc));
            observer.observe(document.head, {
                childList: true,
                subtree: true,
                characterData: true,
            });
            setMountNode(doc.body);
        };

        // about:blank documents are usually ready synchronously, but Chrome
        // can replace the document with a second load event — init on both.
        if (iframe.contentDocument?.readyState === "complete") init();
        iframe.addEventListener("load", init);
        return () => {
            iframe.removeEventListener("load", init);
            observer?.disconnect();
        };
    }, []);

    return (
        <iframe ref={iframeRef} title={title} className={className}>
            {mountNode ? createPortal(children, mountNode) : null}
        </iframe>
    );
}
