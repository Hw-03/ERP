"use client";

import { useEffect, useState } from "react";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface ChildDecision {
  item_id: string;
  item_name: string;
  item_code: string;
  qty: number; // parentQty × 자식 1개당 수량
  action: "keep" | "scrap";
  reason_memo: string;
}

interface DisassembleTreeProps {
  parentItemId: string;
  parentQty: number;
  parentDept: string;
  decisions: ChildDecision[];
  onChange: (decisions: ChildDecision[]) => void;
}

export function DisassembleTree({
  parentItemId,
  parentQty,
  parentDept: _parentDept,
  decisions,
  onChange,
}: DisassembleTreeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // mount 시 BOM 자식 목록 로드 → decisions 초기화
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    deptAdjustmentApi
      .getBomTemplate(parentItemId, "disassembly", parentQty)
      .then((res) => {
        if (cancelled) return;
        const initial: ChildDecision[] = res.lines.map((line) => ({
          item_id: line.item_id,
          item_name: line.item_name,
          item_code: line.item_code ?? "",
          qty: line.quantity,
          action: "keep",
          reason_memo: "",
        }));
        onChange(initial);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "BOM 템플릿 로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentItemId, parentQty]);

  function setAction(idx: number, action: "keep" | "scrap") {
    const next = decisions.map((d, i) => (i === idx ? { ...d, action } : d));
    onChange(next);
  }

  function setMemo(idx: number, memo: string) {
    const next = decisions.map((d, i) => (i === idx ? { ...d, reason_memo: memo } : d));
    onChange(next);
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        BOM 자식 목록 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-[10px] border px-3 py-2 text-xs font-bold text-red-700"
        style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
      >
        {error}
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="py-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        BOM 자식 항목이 없습니다.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col divide-y rounded-[12px] border"
      style={{ borderColor: LEGACY_COLORS.border }}
    >
      {decisions.map((d, idx) => (
        <div
          key={`${d.item_id}-${idx}`}
          className="flex flex-col gap-2 px-4 py-3"
          style={{ background: idx % 2 === 0 ? LEGACY_COLORS.s1 : LEGACY_COLORS.s2 }}
        >
          {/* 품목 헤더 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {d.item_code}
            </span>
            <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
              {d.item_name}
            </span>
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
              {d.qty}개
            </span>

            {/* 살림 / 폐기 라디오 */}
            <div className="ml-auto flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1 text-xs font-bold">
                <input
                  type="radio"
                  name={`action-${parentItemId}-${idx}`}
                  value="keep"
                  checked={d.action === "keep"}
                  onChange={() => setAction(idx, "keep")}
                  className="accent-green-600"
                />
                <span style={{ color: d.action === "keep" ? "#16a34a" : LEGACY_COLORS.muted2 }}>
                  살림
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-1 text-xs font-bold">
                <input
                  type="radio"
                  name={`action-${parentItemId}-${idx}`}
                  value="scrap"
                  checked={d.action === "scrap"}
                  onChange={() => setAction(idx, "scrap")}
                  className="accent-red-600"
                />
                <span style={{ color: d.action === "scrap" ? "#dc2626" : LEGACY_COLORS.muted2 }}>
                  폐기
                </span>
              </label>
            </div>
          </div>

          {/* 메모 */}
          <textarea
            rows={1}
            placeholder="처리 메모 (선택)"
            value={d.reason_memo}
            onChange={(e) => setMemo(idx, e.target.value)}
            className="w-full resize-none rounded-[8px] border px-2 py-1 text-xs font-bold"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: LEGACY_COLORS.s1,
              color: LEGACY_COLORS.text,
            }}
          />
        </div>
      ))}
    </div>
  );
}
