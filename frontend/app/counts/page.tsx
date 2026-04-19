"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type Item, type PhysicalCount } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "@/legacy/_components/legacyUi";

export default function CountsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<PhysicalCount[]>([]);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  // 검색 필터 (검색어 없으면 빈 목록)
  const filteredItems = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return [];
    return items
      .filter((i) =>
        `${i.item_name} ${i.item_code} ${i.barcode ?? ""}`.toLowerCase().includes(kw),
      )
      .slice(0, 40);
  }, [items, search]);

  // 실시간 차이 미리보기
  const previewDiff = useMemo(() => {
    if (!selectedItem || counted === "") return null;
    const num = Number(counted);
    if (Number.isNaN(num)) return null;
    return num - Number(selectedItem.quantity);
  }, [selectedItem, counted]);

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
      setInfo(null);
      const row = await api.submitPhysicalCount({
        item_id: selectedItem.item_id,
        counted_qty: qty,
        reason: reason || undefined,
        operator: operator || undefined,
      });
      const diffSign = Number(row.diff) >= 0 ? "+" : "";
      setInfo(
        `완료: ${row.item_name} · ${diffSign}${formatNumber(row.diff)} 조정됨`,
      );
      setSelectedItem(null);
      setSearch("");
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
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black">실사 입력</h1>
          <Link href="/legacy" className="text-sm" style={{ color: LEGACY_COLORS.blue }}>
            ← 레거시
          </Link>
        </div>

        <div
          className="mb-6 overflow-hidden rounded-[14px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {/* 품목 검색 섹션 */}
          <div
            className="border-b px-3 py-3"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="mb-2 text-[10px] font-bold uppercase tracking-[1px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              품목 검색
            </div>
            <div
              className="flex items-center gap-2 rounded-[11px] border px-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <span>🔍</span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (selectedItem) {
                    setSelectedItem(null);
                    setCounted("");
                  }
                }}
                placeholder="품명 또는 코드 검색..."
                className="w-full bg-transparent py-[9px] text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedItem(null);
                    setCounted("");
                  }}
                  className="text-[11px]"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* 선택된 품목 표시 */}
            {selectedItem ? (
              <div
                className="mt-2 flex items-center justify-between rounded-[11px] border px-3 py-2"
                style={{
                  background: "rgba(79,142,247,.08)",
                  borderColor: LEGACY_COLORS.blue,
                }}
              >
                <div>
                  <div className="text-sm font-semibold">{selectedItem.item_name}</div>
                  <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {selectedItem.item_code} · 총재고{" "}
                    <span className="font-mono font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {formatNumber(selectedItem.quantity)}
                    </span>
                    {" · "}가용{" "}
                    <span className="font-mono">
                      {formatNumber(
                        selectedItem.available_quantity ?? selectedItem.quantity,
                      )}
                    </span>
                    {Number(selectedItem.pending_quantity ?? 0) > 0
                      ? ` · 예약 ${formatNumber(selectedItem.pending_quantity)}`
                      : ""}{" "}
                    {selectedItem.unit}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setSearch("");
                    setCounted("");
                  }}
                  className="text-[11px]"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  ✕
                </button>
              </div>
            ) : filteredItems.length > 0 ? (
              <div
                className="mt-2 max-h-[200px] overflow-y-auto rounded-[11px] border"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                {filteredItems.map((item, i) => (
                  <button
                    key={item.item_id}
                    onClick={() => {
                      setSelectedItem(item);
                      setSearch(item.item_name);
                      // 현재 총재고를 기본값으로 설정 (조정 없음을 기본으로)
                      setCounted(String(Number(item.quantity)));
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                    style={{
                      borderBottom:
                        i < filteredItems.length - 1
                          ? `1px solid ${LEGACY_COLORS.border}`
                          : "none",
                    }}
                  >
                    <div>
                      <div className="text-sm font-semibold">{item.item_name}</div>
                      <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {item.item_code}
                        {item.legacy_part ? ` · ${item.legacy_part}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="font-mono text-sm font-bold"
                        style={{ color: LEGACY_COLORS.cyan }}
                      >
                        {formatNumber(item.quantity)}
                      </div>
                      <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                        {item.unit}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : search.trim() ? (
              <div
                className="mt-2 rounded-[11px] border px-3 py-2 text-sm"
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.muted2,
                }}
              >
                검색 결과 없음
              </div>
            ) : null}
          </div>

          {/* 실사량 입력 섹션 */}
          <div className="px-3 py-3">
            <div
              className="mb-2 text-[10px] font-bold uppercase tracking-[1px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              실사량
            </div>

            <input
              type="number"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="실사 수량 입력..."
              disabled={!selectedItem}
              className="mb-1 w-full rounded-[11px] border px-3 py-[11px] text-center text-[22px] font-bold outline-none disabled:opacity-40"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
                fontFamily: 'Menlo, "Courier New", monospace',
              }}
            />

            {/* 실시간 차이 미리보기 */}
            {previewDiff !== null && (
              <div
                className="mb-3 text-center text-sm font-bold"
                style={{
                  color:
                    previewDiff === 0
                      ? LEGACY_COLORS.muted2
                      : previewDiff > 0
                        ? LEGACY_COLORS.green
                        : LEGACY_COLORS.red,
                }}
              >
                {previewDiff === 0
                  ? "변동 없음"
                  : `${previewDiff > 0 ? "+" : ""}${formatNumber(previewDiff)} 조정 예정`}
              </div>
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <div
                  className="mb-1 text-[10px]"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  담당자
                </div>
                <input
                  type="text"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  placeholder="이름 (선택)"
                  className="w-full rounded-lg border px-2 py-2 text-sm outline-none"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                />
              </div>
              <div>
                <div
                  className="mb-1 text-[10px]"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  사유
                </div>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="사유 (선택)"
                  className="w-full rounded-lg border px-2 py-2 text-sm outline-none"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                />
              </div>
            </div>

            {error && (
              <div
                className="mb-2 rounded-lg px-3 py-2 text-xs"
                style={{ background: "rgba(242,95,92,.1)", color: LEGACY_COLORS.red }}
              >
                {error}
              </div>
            )}
            {info && (
              <div
                className="mb-2 rounded-lg px-3 py-2 text-xs"
                style={{ background: "rgba(31,209,122,.1)", color: LEGACY_COLORS.green }}
              >
                {info}
              </div>
            )}

            <button
              onClick={() => void submit()}
              disabled={saving || !selectedItem || counted === ""}
              className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
              style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
            >
              {saving ? "제출 중..." : "실사 제출"}
            </button>
          </div>
        </div>

        {/* 실사 이력 */}
        <div
          className="mb-2 text-xs font-bold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
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
              <div
                key={c.count_id}
                className="flex items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.item_name}</div>
                  <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    시스템 {formatNumber(c.system_qty)} → 실사 {formatNumber(c.counted_qty)}
                    {c.reason ? ` · ${c.reason}` : ""}
                  </div>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                    {new Date(c.created_at).toLocaleString("ko-KR")}
                    {c.operator ? ` · ${c.operator}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="font-mono text-sm font-bold"
                    style={{
                      color:
                        Number(c.diff) === 0
                          ? LEGACY_COLORS.muted2
                          : Number(c.diff) > 0
                            ? LEGACY_COLORS.green
                            : LEGACY_COLORS.red,
                    }}
                  >
                    {Number(c.diff) >= 0 ? "+" : ""}
                    {formatNumber(c.diff)}
                  </div>
                  <div className="text-[9px]" style={{ color: LEGACY_COLORS.muted }}>
                    {Number(c.diff) === 0 ? "일치" : Number(c.diff) > 0 ? "잉여" : "부족"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
