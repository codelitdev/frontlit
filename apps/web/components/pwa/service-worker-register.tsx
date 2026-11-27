"use client";

import { useEffect } from "react";
import { pushSupported, registerServiceWorker } from "@/lib/web-push";

/** Registers `public/sw.js`, which shows push notifications for new
 * customer messages. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!pushSupported()) return;
    registerServiceWorker().catch(() => undefined);
  }, []);
  return null;
}
