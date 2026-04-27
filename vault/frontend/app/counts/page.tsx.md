---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/counts/page.tsx
status: active
updated: 2026-04-27
source_sha: cf72912abff3
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

- Source: `frontend/app/counts/page.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `8721` bytes

## 연결

- Parent hub: [[frontend/app/counts/counts|frontend/app/counts]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 245줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type Item, type PhysicalCount } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacy/_components/legacyUi";

export default function CountsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<PhysicalCount[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [counted, setCounted] = useState<string>("");
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedItem = useMemo(
    () => items.find((i) => i.item_id === selectedId) ?? null,
    [items, selectedId],
  );

  const load = async () => {
    try {
      const [itemRows, countRows] = await Promise.all([
        api.getItems({ limit: 2000 }),
        api.listPhysicalCounts(),
      ]);
      setItems(itemRows);
      setCounts(countRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    if (!selectedItem) {
      setError("품목을 선택하세요.");
      return;
    }
    const qty = Number(counted);
    if (Number.isNaN(qty) || qty < 0) {
      setError("실사량을 확인하세요.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const row = await api.submitPhysicalCount({
        item_id: selectedItem.item_id,
        counted_qty: qty,
        reason: reason || undefined,
        operator: operator || undefined,
      });
      setInfo(
        `실사 완료: ${row.item_name} · 시스템 ${formatNumber(row.system_qty)} → 실사 ${formatNumber(row.counted_qty)} (diff ${formatNumber(row.diff)})`,
      );
      setCounted("");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "실사 제출 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-6"
      style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}
    >
      <div className="mx-auto max-w-[700px]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black">실사 / 강제 조정</h1>
          <Link href="/legacy" className="text-sm" style={{ color: LEGACY_COLORS.blue }}>
            ← 레거시
          </Link>
        </div>

        <div
          className="mb-6 overflow-hidden rounded-[14px] border p-3"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-2 text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            실사 입력
          </div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mb-2 w-full rounded-lg border px-2 py-2 text-sm"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            <option value="">품목 선택...</option>
            {items.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                [{i.erp_code}] {i.item_name}
              </option>
            ))}
          </select>

          {selectedItem && (
            <div
              className="mb-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
            >
              시스템 재고: {formatNumber(selectedItem.quantity)} {selectedItem.unit}
              {" · "}가용 {formatNumber(selectedItem.available_quantity ?? selectedItem.quantity)}
              {" · "}예약 {formatNumber(selectedItem.pending_quantity ?? 0)}
            </div>
          )}

          <div className="mb-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="실사량"
              className="rounded-lg border px-2 py-2 text-sm"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            />
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="담당자"
              className="rounded-lg border px-2 py-2 text-sm"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            />
          </div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="사유 (선택)"
            className="mb-2 w-full rounded-lg border px-2 py-2 text-sm"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
          <button
            onClick={submit}
            disabled={saving || !selectedId}
            className="w-full rounded-xl py-2 text-sm font-bold"
            style={{
              background: LEGACY_COLORS.blue,
              color: "#fff",
              opacity: saving || !selectedId ? 0.6 : 1,
            }}
          >
            {saving ? "제출 중..." : "실사 제출 + 강제 조정"}
          </button>

          {error && (
            <div
              className="mt-3 rounded-lg px-3 py-2 text-sm"
              style={{
                background: "rgba(242,95,92,.1)",
                color: LEGACY_COLORS.red,
              }}
            >
              {error}
            </div>
          )}
          {info && (
            <div
              className="mt-3 rounded-lg px-3 py-2 text-sm"
              style={{
                background: "rgba(31,209,122,.1)",
                color: LEGACY_COLORS.green,
              }}
            >
              {info}
            </div>
          )}
        </div>

        <div className="mb-2 text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          최근 실사 이력
        </div>
        {counts.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            이력이 없습니다.
          </div>
        ) : (
          <div
            className="divide-y overflow-hidden rounded-[14px] border"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            {counts.map((c) => (
              <div key={c.count_id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">
                    {c.item_name}
                  </div>
                  <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    시스템 {formatNumber(c.system_qty)} → 실사 {formatNumber(c.counted_qty)}
                    {c.reason ? ` · ${c.reason}` : ""}
                  </div>
                  <div className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                    {new Date(c.created_at).toLocaleString("ko-KR")}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
