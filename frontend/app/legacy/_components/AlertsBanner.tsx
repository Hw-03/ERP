"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type StockAlert } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

/** Lightweight banner that surfaces unacknowledged alerts.
 *  Fetched on mount and re-polled every 60s. Click → /alerts. */
export function AlertsBanner() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const rows = await api.listAlerts({ includeAcknowledged: false });
        if (mounted) setAlerts(rows);
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  if (alerts.length === 0) return null;

  const safety = alerts.filter((a) => a.kind === "SAFETY").length;
  const variance = alerts.filter((a) => a.kind === "COUNT_VARIANCE").length;

  return (
    <Link
      href="/alerts"
      className="block rounded-[12px] border px-3 py-2 text-xs font-semibold transition-all hover:brightness-110"
      style={{
        background: "rgba(244,185,66,.12)",
        borderColor: "rgba(244,185,66,.5)",
        color: LEGACY_COLORS.yellow,
      }}
    >
      ⚠️ 미확인 알림 {alerts.length}건
      {safety > 0 ? ` · 안전재고 ${safety}` : ""}
      {variance > 0 ? ` · 실사편차 ${variance}` : ""}
      <span className="ml-2 opacity-70">→</span>
    </Link>
  );
}
