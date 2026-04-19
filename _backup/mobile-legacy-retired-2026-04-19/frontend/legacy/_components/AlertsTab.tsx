"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type AlertKind, type StockAlert } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "./legacyUi";

const KIND_LABEL: Record<AlertKind, string> = {
  SAFETY: "안전재고",
  COUNT_VARIANCE: "실사편차",
};

const KIND_COLOR: Record<AlertKind, string> = {
  SAFETY: LEGACY_COLORS.yellow,
  COUNT_VARIANCE: LEGACY_COLORS.red,
};

export function AlertsTab() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [includeAcked, setIncludeAcked] = useState(false);
  const [kindFilter, setKindFilter] = useState<AlertKind | "ALL">("ALL");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await api.listAlerts({ includeAcknowledged: includeAcked });
      setAlerts(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeAcked]);

  const scan = async () => {
    try {
      setScanning(true);
      setError(null);
      await api.scanSafetyAlerts();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "스캔 실패");
    } finally {
      setScanning(false);
    }
  };

  const ack = async (id: string) => {
    try {
      await api.acknowledgeAlert(id);
      setAlerts((prev) =>
        prev.map((a) =>
          a.alert_id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인 실패");
    }
  };

  const unacked = alerts.filter((a) => !a.acknowledged_at);
  const safetyCount = unacked.filter((a) => a.kind === "SAFETY").length;
  const countVarCount = unacked.filter((a) => a.kind === "COUNT_VARIANCE").length;

  const displayed = useMemo(
    () => alerts.filter((a) => kindFilter === "ALL" || a.kind === kindFilter),
    [alerts, kindFilter],
  );

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "전체 미확인", value: unacked.length, color: LEGACY_COLORS.blue, filter: "ALL" as const },
          { label: "안전재고", value: safetyCount, color: LEGACY_COLORS.yellow, filter: "SAFETY" as const },
          { label: "실사편차", value: countVarCount, color: LEGACY_COLORS.red, filter: "COUNT_VARIANCE" as const },
        ].map((card) => (
          <button
            key={card.label}
            onClick={() => setKindFilter(kindFilter === card.filter ? "ALL" : card.filter)}
            className="relative overflow-hidden rounded-[14px] border px-3 py-[10px] text-left"
            style={{
              background: kindFilter === card.filter ? `${card.color}18` : LEGACY_COLORS.s1,
              borderColor: kindFilter === card.filter ? card.color : LEGACY_COLORS.border,
            }}
          >
            <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.8px]" style={{ color: LEGACY_COLORS.muted }}>
              {card.label}
            </div>
            <div className="font-mono text-xl font-bold" style={{ color: card.color }}>
              {card.value}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: card.color }} />
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => void scan()}
          disabled={scanning}
          className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60"
          style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
        >
          {scanning ? "스캔 중..." : "안전재고 스캔"}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          <input type="checkbox" checked={includeAcked} onChange={(e) => setIncludeAcked(e.target.checked)} />
          확인된 알림 포함
        </label>
      </div>

      {error && (
        <div
          className="mb-3 rounded-xl border px-3 py-2 text-xs"
          style={{ background: "rgba(242,95,92,.1)", borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>로딩 중...</div>
      ) : displayed.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          {unacked.length === 0 ? "미확인 알림이 없습니다." : "표시할 알림이 없습니다."}
        </div>
      ) : (
        <div
          className="divide-y overflow-hidden rounded-[14px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {displayed.map((a) => (
            <div
              key={a.alert_id}
              className="flex items-start justify-between gap-3 px-3 py-3"
              style={{ opacity: a.acknowledged_at ? 0.55 : 1 }}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-[2px] text-[10px] font-bold"
                    style={{ background: `${KIND_COLOR[a.kind]}22`, color: KIND_COLOR[a.kind] }}
                  >
                    {KIND_LABEL[a.kind]}
                  </span>
                  <span className="truncate text-sm font-semibold">{a.item_name}</span>
                </div>

                {a.kind === "SAFETY" && a.threshold != null && a.observed_value != null && (
                  <div className="mb-1 flex items-center gap-1 text-[11px]">
                    <span className="font-mono font-bold" style={{ color: LEGACY_COLORS.red }}>
                      {formatNumber(a.observed_value)}
                    </span>
                    <span style={{ color: LEGACY_COLORS.muted }}>/</span>
                    <span className="font-mono" style={{ color: LEGACY_COLORS.muted2 }}>
                      {formatNumber(a.threshold)}
                    </span>
                    <span style={{ color: LEGACY_COLORS.muted }}>안전재고</span>
                  </div>
                )}

                {a.kind === "COUNT_VARIANCE" && a.observed_value != null && (
                  <div className="mb-1 text-[11px]">
                    <span
                      className="font-mono font-bold"
                      style={{ color: Number(a.observed_value) >= 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}
                    >
                      {Number(a.observed_value) >= 0 ? "+" : ""}
                      {formatNumber(a.observed_value)}
                    </span>
                    <span className="ml-1" style={{ color: LEGACY_COLORS.muted }}>편차</span>
                  </div>
                )}

                {a.message && (
                  <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{a.message}</div>
                )}
                <div className="mt-1 text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                  {new Date(a.triggered_at).toLocaleString("ko-KR")}
                  {a.acknowledged_at ? ` · 확인됨${a.acknowledged_by ? ` (${a.acknowledged_by})` : ""}` : ""}
                </div>
              </div>

              {!a.acknowledged_at && (
                <button
                  onClick={() => void ack(a.alert_id)}
                  className="shrink-0 rounded-lg px-3 py-1 text-[10px] font-bold"
                  style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                >
                  확인
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
