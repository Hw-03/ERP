"use client";

import type { ProductModel } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * 조립 부서 직원의 담당 모델 편집 위젯.
 * - 배열 순서 = 우선순위 (0 = 1순위, 작을수록 위)
 * - ▲/▼ 버튼으로 순서 조정, ✕ 로 제거, 미선택 모델 칩 클릭으로 추가
 * - 입출고 화면에서 조립 그룹 내 정렬 시 이 순서를 사용한다
 */
export function AssignedModelsEditor({
  models,
  selected,
  onChange,
}: {
  models: ProductModel[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const labelOf = (slot: number) => {
    const m = models.find((x) => x.slot === slot);
    if (!m) return `slot ${slot}`;
    return m.model_name || m.symbol || `slot ${slot}`;
  };
  const unselected = models.filter((m) => !selected.includes(m.slot));

  function add(slot: number) {
    if (selected.includes(slot)) return;
    onChange([...selected, slot]);
  }
  function remove(slot: number) {
    onChange(selected.filter((s) => s !== slot));
  }
  function move(idx: number, delta: number) {
    const next = selected.slice();
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div>
      {selected.length === 0 ? (
        <div
          className="rounded-[10px] border px-3 py-2 text-[12px]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          담당 모델 없음
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {selected.map((slot, idx) => (
            <div
              key={slot}
              className="flex items-center gap-2 rounded-[10px] border px-2.5 py-2"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
              >
                {idx + 1}
              </span>
              <span className="flex-1 text-[13px]" style={{ color: LEGACY_COLORS.text }}>
                {labelOf(slot)}
              </span>
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="px-1 text-[12px] disabled:opacity-30"
                style={{ color: LEGACY_COLORS.muted2 }}
                aria-label="우선순위 올리기"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === selected.length - 1}
                className="px-1 text-[12px] disabled:opacity-30"
                style={{ color: LEGACY_COLORS.muted2 }}
                aria-label="우선순위 내리기"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => remove(slot)}
                className="px-1 text-[12px]"
                style={{ color: LEGACY_COLORS.red }}
                aria-label="제거"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {unselected.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
            추가
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unselected.map((m) => (
              <button
                key={m.slot}
                type="button"
                onClick={() => add(m.slot)}
                className="rounded-full border px-2 py-[3px] text-[11px] transition-colors hover:brightness-110"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              >
                + {m.model_name || m.symbol || `slot ${m.slot}`}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
