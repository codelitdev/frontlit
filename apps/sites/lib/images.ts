import { getImageProps } from "next/image";
import { setImageAttributesResolver } from "@frontlit/page-builder/server";
import { imageRemoteHosts } from "./image-hosts.mjs";

function isOptimizable(src: string): boolean {
  try {
    const { protocol, hostname } = new URL(src);
    return protocol === "https:" && imageRemoteHosts.includes(hostname);
  } catch {
    return false;
  }
}

// Page-builder blocks render plain `<img>` with the editor's URL. Route the
// ones on allowed hosts through Next's optimizer (resized, modern formats);
// anything else keeps its original URL.
setImageAttributesResolver(({ src, alt, sizes }) => {
  if (!isOptimizable(src)) return null;
  const { props } = getImageProps({ src, alt, sizes: sizes ?? "100vw", fill: true });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
});
