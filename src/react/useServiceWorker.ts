"use client";

import { useEffect, useState } from "react";
import { asset } from "@/lib/paths";

export type UpdateState = "idle" | "available";

/**
 * Registers the service worker, and reports when a new version is waiting.
 *
 * Registered late on purpose: after `load` and then on an idle callback, so
 * it never competes with first paint. Production only, because a worker
 * caching a dev bundle is a confusing way to spend an afternoon.
 *
 * The worker does not call `skipWaiting`, so an update sits waiting rather
 * than swapping the bundle underneath a run in progress. That is what this
 * hook surfaces: the player decides when to take it.
 */
export function useServiceWorker(): {
  update: UpdateState;
  applyUpdate: () => void;
} {
  const [update, setUpdate] = useState<UpdateState>("idle");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let cancelled = false;

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        setWaiting(reg.waiting);
        setUpdate("available");
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // "installed" with an existing controller means an update is ready,
          // rather than a first install.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(installing);
            setUpdate("available");
          }
        });
      });
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register(asset("/sw.js"), {
          scope: asset("/"),
        });
        if (cancelled) return;
        registration = reg;
        watch(reg);
      } catch {
        // A failed registration costs the player nothing but offline play.
      }
    };

    const schedule = () => {
      if ("requestIdleCallback" in window) {
        (window as Window & { requestIdleCallback: (cb: () => void) => void })
          .requestIdleCallback(register);
      } else {
        setTimeout(register, 0);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      void registration;
    };
  }, []);

  const applyUpdate = () => {
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
    // The new worker takes control, then the page reloads onto it.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
  };

  return { update, applyUpdate };
}
