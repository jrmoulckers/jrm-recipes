"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Wifi, WifiOff } from "lucide-react";

/** Shared toast id so the offline notice is replaced (not stacked) by "back online". */
const CONNECTIVITY_TOAST_ID = "connectivity-status";

/**
 * Session-wide connectivity status (#141). Mounted once near the app's toaster,
 * this listens for the browser's `online` / `offline` transitions and surfaces
 * calm, consistent status copy — the offline notice persists until the network
 * returns, then is swapped for a brief "back online" reassurance. It renders no
 * markup of its own; the standalone `/~offline` page keeps its own controls.
 */
export function ConnectivityStatus() {
  const t = useTranslations("pwa.connectivity");
  React.useEffect(() => {
    const handleOffline = () => {
      toast(t("offline"), {
        id: CONNECTIVITY_TOAST_ID,
        icon: <WifiOff className="size-4" />,
        duration: Infinity,
      });
    };
    const handleOnline = () => {
      toast.success(t("online"), {
        id: CONNECTIVITY_TOAST_ID,
        icon: <Wifi className="size-4" />,
        duration: 3000,
      });
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [t]);

  return null;
}
