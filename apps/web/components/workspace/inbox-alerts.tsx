"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/codelit/dialog";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { isChimeMuted, playChime, setChimeMuted } from "@/lib/chime";
import { useInboxLive, type RequesterMessage } from "@/lib/use-inbox-live";
import {
  needsHomeScreenInstall,
  pushPublicKey,
  pushSupported,
  syncPushSubscription,
  turnOffPush,
  turnOnPush,
} from "@/lib/web-push";

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

/** Web Push state for this browser. `publicKey` is undefined until the API
 * answers and null when the server has push turned off. */
const push: { publicKey: string | null | undefined; active: boolean } = {
  publicKey: undefined,
  active: false,
};

/** How this device can be notified:
 * - `push`: Web Push, works with no FrontLit tab open.
 * - `install`: iPhone/iPad Safari, which needs FrontLit on the Home Screen first.
 * - `page`: the open tab shows a notification while it is in the background.
 * - `none`: no notifications in this browser. */
type NotifyMode = "push" | "install" | "page" | "none";

function notifyMode(): NotifyMode {
  if (typeof push.publicKey === "string") {
    if (pushSupported()) return "push";
    if (needsHomeScreenInstall()) return "install";
  }
  return desktopSupported() ? "page" : "none";
}

type Prefs = { sound: boolean; desktop: boolean; blocked: boolean; mode: NotifyMode };
let cachedPrefs: Prefs = { sound: true, desktop: false, blocked: false, mode: "none" };
const serverPrefs: Prefs = cachedPrefs;

function readPrefs(): Prefs {
  const mode = notifyMode();
  const next = {
    sound: !isChimeMuted(),
    desktop:
      mode === "push"
        ? push.active && Notification.permission === "granted"
        : desktopOn(),
    blocked: desktopSupported() && Notification.permission === "denied",
    mode,
  };
  if (
    next.sound !== cachedPrefs.sound ||
    next.desktop !== cachedPrefs.desktop ||
    next.blocked !== cachedPrefs.blocked ||
    next.mode !== cachedPrefs.mode
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
 * (if turned on) while hidden, and a toast outside the inbox. With Web Push
 * on, the service worker shows the notification instead, also when no tab
 * is open.
 */
export function InboxAlerts() {
  const { currentTeamId } = useWorkspaceAccess();
  const pathname = usePathname();
  const router = useRouter();
  const unread = useRef(0);
  const baseTitle = useRef("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const publicKey = await pushPublicKey();
      let active = false;
      if (publicKey && pushSupported()) {
        active = await syncPushSubscription(publicKey).catch(() => false);
      }
      if (cancelled) return;
      push.publicKey = publicKey;
      push.active = active;
      notifyChange();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        // With push available, the service worker shows it instead.
        if (notifyMode() === "page" && desktopOn()) {
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

/** One switch in the notification settings. */
function SettingRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/** This person's alerts for new customer messages, on this device: the
 * sound and notifications. Opened from the account menu. */
export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const prefs = usePrefs();
  const [busy, setBusy] = useState(false);

  const togglePush = async (on: boolean) => {
    if (!push.publicKey) return;
    setBusy(true);
    try {
      if (on) {
        push.active = await turnOnPush(push.publicKey);
      } else {
        await turnOffPush();
        push.active = false;
      }
    } catch {
      toast.error(
        on
          ? "Couldn't turn on notifications on this device. Try again."
          : "Couldn't turn off notifications on this device. Try again.",
      );
    } finally {
      setBusy(false);
      notifyChange();
    }
  };

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

  const blocked =
    "Blocked. Allow notifications for this site in your browser settings.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            How this device tells you about new customer messages. Set it on each device
            you use.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SettingRow
            id="alert-sound"
            label="Play a sound"
            description="A short chime when a customer message needs a reply."
            checked={prefs.sound}
            onChange={(on) => {
              setChimeMuted(!on);
              notifyChange();
              if (on) playChime();
            }}
          />
          {prefs.mode === "push" && (
            <SettingRow
              id="alert-push"
              label="Notify me on this device"
              description={
                prefs.blocked ? blocked : "Shown even when FrontLit isn't open."
              }
              checked={prefs.desktop}
              disabled={prefs.blocked || busy}
              onChange={(on) => void togglePush(on)}
            />
          )}
          {prefs.mode === "install" && (
            <p className="text-sm text-muted-foreground">
              To get notifications on this iPhone or iPad, open FrontLit in Safari, tap
              Share, then Add to Home Screen, and turn them on from the Home Screen app.
            </p>
          )}
          {prefs.mode === "page" && (
            <SettingRow
              id="alert-desktop"
              label="Desktop notifications"
              description={
                prefs.blocked ? blocked : "Shown when this tab is in the background."
              }
              checked={prefs.desktop}
              disabled={prefs.blocked}
              onChange={(on) => void toggleDesktop(on)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
