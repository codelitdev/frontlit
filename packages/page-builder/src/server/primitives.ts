/**
 * The hook-free primitives. Unlike `@frontlit/page-builder/primitives` (one
 * client bundle shared with the builder and every Radix control), this entry
 * is callable from server components and, being small, cheap to import from
 * client components too. Interactive primitives (dialog, drawer, select, …)
 * stay in the main entry.
 */
export * from "../primitives/badge";
export * from "../primitives/button";
export * from "../primitives/caption";
export * from "../primitives/card";
export * from "../primitives/display";
export * from "../primitives/heading";
export * from "../primitives/header1";
export * from "../primitives/header2";
export * from "../primitives/header3";
export * from "../primitives/header4";
export * from "../primitives/image";
export * from "../primitives/input";
export * from "../primitives/label";
export * from "../primitives/link";
export * from "../primitives/preheader";
export * from "../primitives/section";
export * from "../primitives/subheader1";
export * from "../primitives/subheader2";
export * from "../primitives/text1";
export * from "../primitives/text2";
export * from "../primitives/textarea";
