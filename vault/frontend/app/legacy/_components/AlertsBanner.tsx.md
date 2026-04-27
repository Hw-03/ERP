---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/AlertsBanner.tsx
status: active
updated: 2026-04-27
source_sha: bbbcfd1bb63f
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AlertsBanner.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/AlertsBanner.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1529` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
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
import { LEGACY_COLORS } from "./legacyUi";

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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
