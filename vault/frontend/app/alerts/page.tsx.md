---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/alerts/page.tsx
status: active
updated: 2026-04-27
source_sha: 15bcd1c610a6
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# page.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/alerts/page.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `5197` bytes

## 연결

- Parent hub: [[frontend/app/alerts/alerts|frontend/app/alerts]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type StockAlert } from "@/lib/api";
import { LEGACY_COLORS } from "../legacy/_components/legacyUi";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeAcked, setIncludeAcked] = useState(false);
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
      await api.scanSafetyAlerts();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "스캔 실패");
    }
  };

  const ack = async (id: string) => {
    try {
      await api.acknowledgeAlert(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인 실패");
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-6"
      style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}
    >
      <div className="mx-auto max-w-[600px]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black">재고 알림</h1>
          <Link href="/legacy" className="text-sm" style={{ color: LEGACY_COLORS.blue }}>
            ← 레거시
          </Link>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={scan}
            className="rounded-xl px-3 py-2 text-sm font-bold"
            style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
          >
            안전재고 스캔
          </button>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeAcked}
              onChange={(e) => setIncludeAcked(e.target.checked)}
            />
            확인된 알림 포함
          </label>
        </div>

        {error && (
          <div
            className="mb-3 rounded-xl border px-3 py-2 text-sm"
            style={{ background: "rgba(242,95,92,.1)", borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            로딩 중...
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            표시할 알림이 없습니다.
          </div>
        ) : (
          <div
            className="divide-y overflow-hidden rounded-[14px] border"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            {alerts.map((a) => (
              <div key={a.alert_id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-[2px] text-sm font-bold"
                      style={{
                        background:
                          a.kind === "SAFETY"
                            ? "rgba(244,185,66,.15)"
                            : "rgba(242,95,92,.15)",
                        color: a.kind === "SAFETY" ? LEGACY_COLORS.yellow : LEGACY_COLORS.red,
                      }}
                    >
                      {a.kind === "SAFETY" ? "안전재고" : "실사편차"}
                    </span>
                    <div className="truncate text-base font-semibold">{a.item_name}</div>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {a.message}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                    {new Date(a.triggered_at).toLocaleString("ko-KR")}
                    {a.acknowledged_at ? ` · 확인: ${a.acknowledged_by ?? ""}` : ""}
                  </div>
                </div>
                {!a.acknowledged_at && (
                  <button
                    onClick={() => ack(a.alert_id)}
                    className="rounded-lg px-3 py-1 text-sm font-bold"
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
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
