"use client";

import { useRef, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "@/lib/api/stocktake";
import type { StocktakeMenuVisibility } from "@/lib/api/types/stocktake";
import type { Operator } from "../login/useCurrentOperator";
import { STOCKTAKE_BUTTON, STOCKTAKE_CARD } from "./StocktakeCountEditor";
import { useStocktakeMenuVisibility } from "./useStocktakeMenuVisibility";

/** Bulk saves update employee checkboxes; subsequent individual edits remain independent. */
export function StocktakeMenuVisibilityCard({ operator, token, disabled = false }: { operator: Operator; token: string; disabled?: boolean }): ReactNode {
  const queryClient = useQueryClient();
  const visibility = useStocktakeMenuVisibility(operator);
  const saving = useRef(false);
  const update = useMutation({
    mutationFn: (enabled: boolean) => requestJson<StocktakeMenuVisibility>("/api/stocktakes/menu-visibility", token,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }),
    onSuccess: async data => {
      queryClient.setQueryData(["stocktake", "menu-visibility", token], data);
      await queryClient.invalidateQueries({ queryKey: ["stocktake", "menu-visibility"] });
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: ["stocktake", "menu-visibility"] }); },
    onSettled: () => { saving.current = false; },
    retry: false,
  });
  const data = visibility.data;
  return <section className={STOCKTAKE_CARD} aria-label="참여 직원 메뉴 표시">
    <h2 className="text-base font-semibold">참여 직원 메뉴 표시</h2>
    <p className="mt-2 text-sm text-[var(--c-muted2)]">대상 부서의 전수조사 탭을 한 번에 켜고 끕니다.</p>
    {visibility.isPending ? <p role="status" className="mt-3 text-sm text-[var(--c-muted2)]">표시 설정을 불러오는 중입니다.</p>
      : visibility.isError ? <div className="mt-3 space-y-2">
        <p role="alert" className="text-sm text-[var(--c-red)]">{visibility.error.message}</p>
        <button type="button" className={STOCKTAKE_BUTTON} onClick={() => void visibility.refetch()}>표시 설정 다시 불러오기</button>
      </div> : data && <>
        <div className="mt-3 text-xs leading-5 text-[var(--c-muted2)]">
          <p>{data.participant_departments.join(" · ")}</p>
          <p>활성 직원 {data.participant_count.toLocaleString()}명</p>
        </div>
        <button type="button" role="switch" aria-label="참여 직원에게 전수조사 탭 표시" aria-checked={data.enabled}
          disabled={disabled || update.isPending || visibility.isFetching}
          onClick={() => { if (saving.current) return; saving.current = true; update.mutate(!data.enabled); }}
          className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--c-border-strong)] bg-[var(--c-s2)] px-3 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]">
          <span>{data.enabled ? "일괄 표시 켜짐" : "일괄 표시 꺼짐"}</span>
          <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${data.enabled ? "bg-[var(--c-blue)]" : "bg-[var(--c-muted)]"}`}>
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--c-s1)] shadow-sm transition-transform motion-reduce:transition-none ${data.enabled ? "translate-x-5" : "translate-x-0"}`} />
          </span>
        </button>
        <button type="button" className={`${STOCKTAKE_BUTTON} mt-2`}
          disabled={disabled || update.isPending || visibility.isFetching}
          onClick={() => { if (saving.current) return; saving.current = true; update.mutate(data.enabled); }}>
          현재 일괄 설정 다시 적용
        </button>
        <p className="mt-2 text-xs leading-5 text-[var(--c-muted2)]">직원 관리의 표시 설정도 함께 바뀝니다. 이후 직원별로 다시 조정할 수 있습니다. 부서 정·부 담당자는 제외됩니다.</p>
      </>}
    {update.isPending && <p role="status" className="mt-2 text-xs text-[var(--c-muted2)]">표시 설정을 저장하는 중입니다.</p>}
    {update.isError && <p role="alert" className="mt-2 text-sm text-[var(--c-red)]">{update.error.message}</p>}
    {update.isSuccess && <p role="status" className="mt-2 text-xs text-[var(--c-green)]">{update.data.enabled ? "일괄 표시를 켰습니다." : "일괄 표시를 껐습니다."}</p>}
  </section>;
}
