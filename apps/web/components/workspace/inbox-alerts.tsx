"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon, BellOffIcon } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/ui/codelit/icon-button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/codelit/dropdown-menu";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { isChimeMuted, playChime, setChimeMuted } from "@/lib/chime";
import { useInboxLive, type RequesterMessage } from "@/lib/use-inbox-live";

const DESKTOP_KEY = "frontlit:inbox-desktop";

/** Preferences live in localStorage; this store lets the menu and the
 * listener see changes made by each other. */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notifyChange() {
  for (const listener of listeners) listener();
}

function desktopSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

function desktopWanted(): boolean {
  try {
    return localStorage.getItem(DESKTOP_KEY) === "1";
  } catch {
    return false;
  }
}

function desktopOn(): boolean {
  return desktopSupported() && desktopWanted() && Notification.permission === "granted";
}

type Prefs = { sound: boolean; desktop: boolean; blocked: boolean };
let cachedPrefs: Prefs = { sound: true, desktop: false, blocked: false };
const serverPrefs: Prefs = cachedPrefs;

function readPrefs(): Prefs {
  const next = {
    sound: !isChimeMuted(),
    desktop: desktopOn(),
    blocked: desktopSupported() && Notification.permission === "denied",
  };
  if (
    next.sound !== cachedPrefs.sound ||
    next.desktop !== cachedPrefs.desktop ||
    next.blocked !== cachedPrefs.blocked
  ) {
    cachedPrefs = next;
  }
  return cachedPrefs;
}

function usePrefs() {
  return useSyncExternalStore(subscribe, readPrefs, () => serverPrefs);
}

/**
 * Tells agents about new requester messages on any workspace page: a chime,
 * a count in the tab title while the tab is hidden, a desktop notification
 * (if turned on) while hidden, and a toast outside the inbox.
 */
export function InboxAlerts() {
  const { currentTeamId } = useWorkspaceAccess();
  const pathname = usePathname();
  const router = useRouter();
  const unread = useRef(0);
  const baseTitle = useRef("");

  const paintTitle = useCallback(() => {
    if (unread.current && document.hidden) {
      if (!baseTitle.current) baseTitle.current = document.title;
      document.title = `(${unread.current}) ${baseTitle.current}`;
    } else if (baseTitle.current) {
      document.title = baseTitle.current;
      baseTitle.current = "";
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) unread.current = 0;
      paintTitle();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [paintTitle]);

  const openTicket = useCallback(
    (ticketId: string) => router.push(`/?ticket=${ticketId}`),
    [router],
  );

  const onUpdate = useCallback(
    (ticketId: string, message?: RequesterMessage) => {
      if (!message) return;
      playChime();
      if (document.hidden) {
        unread.current += 1;
        paintTitle();
        if (desktopOn()) {
          const notification = new Notification(`New message from ${message.from}`, {
            body: message.preview,
            tag: ticketId,
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
            openTicket(ticketId);
          };
        }
        return;
      }
      if (pathname !== "/") {
        toast(`New message from ${message.from}`, {
          description: message.preview,
          action: { label: "Open", onClick: () => openTicket(ticketId) },
        });
      }
    },
    [openTicket, paintTitle, pathname],
  );

  useInboxLive(onUpdate, currentTeamId);
  return null;
}

/** Header menu for the alert sound and desktop notifications. */
export function InboxAlertsMenu() {
  const prefs = usePrefs();
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(desktopSupported()), []);

  const toggleDesktop = async (on: boolean) => {
    try {
      if (on) {
        localStorage.setItem(DESKTOP_KEY, "1");
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } else {
        localStorage.removeItem(DESKTOP_KEY);
      }
    } catch {
      // Storage or permission API unavailable.
    }
    notifyChange();
  };

  const silent = !prefs.sound && !prefs.desktop;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" aria-label="Message alerts" title="Message alerts">
          {silent ? <BellOffIcon /> : <BellIcon />}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Alerts for new customer messages</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs.sound}
          onCheckedChange={(on) => {
            setChimeMuted(!on);
            notifyChange();
            if (on) playChime();
          }}
          onSelect={(event) => event.preventDefault()}
        >
          Play a sound
        </DropdownMenuCheckboxItem>
        {supported && (
          <DropdownMenuCheckboxItem
            checked={prefs.desktop}
            disabled={prefs.blocked}
            onCheckedChange={(on) => void toggleDesktop(on === true)}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="flex flex-col">
              <span>Desktop notifications</span>
              <span className="text-xs text-muted-foreground">
                {prefs.blocked
                  ? "Blocked. Allow notifications for this site in your browser settings."
                  : "Shown when this tab is in the background."}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
