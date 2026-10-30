"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CostActor, ItemCost } from "@/lib/api/types/cost";
import { useSaveCompanyCostMutation, useSaveCostStandardsMutation } from "@/lib/queries/useCostQuery";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { costNumber } from "./CostSummaryCard";

/** Match server decimal multiplication and half-up rounding without binary floats. */
export function convertedPrice(price: string, rate: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(price) || !/^\d+(\.\d{1,6})?$/.test(rate)) return null;
  const scaled = (value: string, places: number): bigint => {
    const [integer, fraction = ""] = value.split(".");
    return BigInt(integer + fraction.padEnd(places, "0"));
  };
  const exchange = scaled(rate, 6);
  if (exchange === BigInt(0)) return null;
  const cents = (scaled(price, 2) * exchange + BigInt(500000)) / BigInt(1000000);
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

/** Keep purchase currency inputs, per-person time and company hourly rate together. */
export function CostStandardsEditor({ cost, actor, onClose, onSaved, onStateChange }: { cost: ItemCost; actor: CostActor; onClose: () => void; onSaved?: () => void; onStateChange?: (state: { dirty: boolean; busy: boolean }) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    form.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    form.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus({ preventScroll: true });
  }, []);
  const [price, setPrice] = useState(cost.standards.standard_purchase_price ?? "");
  const [currency, setCurrency] = useState(cost.standards.purchase_currency ?? "KRW");
  const [foreignPrice, setForeignPrice] = useState(cost.standards.foreign_purchase_price ?? "");
  const [exchangeRate, setExchangeRate] = useState(cost.standards.purchase_exchange_rate ?? "");
  const [date, setDate] = useState(cost.standards.purchase_price_effective_date ?? "");
  const [minutes, setMinutes] = useState(cost.standards.standard_work_minutes ?? "");
  const [rate, setRate] = useState(cost.hourly_labor_rate ?? "");
  const [error, setError] = useState<string | null>(null);
  const saveItem = useSaveCostStandardsMutation(actor);
  const saveCompany = useSaveCompanyCostMutation(actor);
  const busy = saveItem.isPending || saveCompany.isPending;
  const canEditPurchase = cost.process_type_code.endsWith("R") && cost.tree.children.length === 0;
  const foreign = currency !== "KRW";
  const converted = foreign ? convertedPrice(foreignPrice, exchangeRate) : null;
  const dirty = minutes !== (cost.standards.standard_work_minutes ?? "") || rate !== (cost.hourly_labor_rate ?? "") || (canEditPurchase && (price !== (cost.standards.standard_purchase_price ?? "") || date !== (cost.standards.purchase_price_effective_date ?? "") || currency !== (cost.standards.purchase_currency ?? "KRW") || foreignPrice !== (cost.standards.foreign_purchase_price ?? "") || exchangeRate !== (cost.standards.purchase_exchange_rate ?? "")));
  useLayoutEffect(() => { onStateChange?.({ dirty, busy }); }, [onStateChange, dirty, busy]);
  const saveContext = useRef<{ active: boolean } | null>(null);
  useLayoutEffect(() => {
    const context = { active: true };
    saveContext.current = context;
    return () => { context.active = false; };
  }, [cost.item_id, cost.can_edit, actor.employee_id, actor.token]);
  const fields = [
    { label: "기준 매입단가 (원)", value: price, set: setPrice, type: "number", show: canEditPurchase && !foreign },
    { label: `외화 매입단가 (${currency})`, value: foreignPrice, set: setForeignPrice, type: "number", show: canEditPurchase && foreign },
    { label: `적용 환율 (원 / 1 ${currency})`, value: exchangeRate, set: setExchangeRate, type: "number", show: canEditPurchase && foreign },
    { label: "단가 기준일", value: date, set: setDate, type: "date", show: canEditPurchase },
    { label: "1인 1개 추가 작업시간 (분)", value: minutes, set: setMinutes, type: "number", show: true },
    { label: "회사 공통 시급 (원/시간)", value: rate, set: setRate, type: "number", show: true },
  ];
  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const context = saveContext.current;
    if (!context?.active || !cost.can_edit) return;
    setError(null);
    if (canEditPurchase && foreign && converted === null) {
      setError("외화 단가와 0보다 큰 환율을 입력해 주세요. 단가는 소수 둘째 자리, 환율은 여섯째 자리까지 입력할 수 있습니다.");
      return;
    }
    try {
      await saveItem.mutateAsync({
        itemId: cost.item_id,
        standards: {
          standard_work_minutes: minutes.trim() || null,
          ...(canEditPurchase ? {
            ...(foreign ? {
              purchase_currency: currency,
              foreign_purchase_price: foreignPrice.trim(),
              purchase_exchange_rate: exchangeRate.trim(),
            } : {
              standard_purchase_price: price.trim() || null,
              ...((cost.standards.purchase_currency ?? "KRW") !== "KRW" ? { purchase_currency: "KRW" } : {}),
            }),
            purchase_price_effective_date: date || null,
          } : {}),
        },
      });
      if (!context.active) return;
      if ((rate.trim() || null) !== cost.hourly_labor_rate) await saveCompany.mutateAsync(rate.trim() || null);
      if (!context.active) return;
      (onSaved ?? onClose)();
    } catch (failure) {
      if (context.active) setError(failure instanceof Error ? failure.message : "기준값을 저장하지 못했습니다.");
    }
  }
  return <form ref={formRef} onSubmit={(event) => void save(event)} aria-label="원가 기준값 수정" className="mt-4 rounded-[16px] border p-4" style={{ borderColor: "var(--c-border)", background: "var(--c-s2)" }}>
    <h3 className="text-sm font-bold">{cost.tree.item_name} · 기준값 수정</h3>
    <p className="mt-1 text-xs leading-5" style={{ color: "var(--c-muted2)" }}>{foreign ? "외화 단가와 환율을 함께 입력합니다. 환율은 외화 1단위당 원화 금액입니다." : "비워서 저장하면 기준값을 지웁니다. 0은 확인된 값으로 계산합니다."}</p>
    <fieldset disabled={busy || !cost.can_edit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {canEditPurchase && <label className="block text-xs" style={{ color: "var(--c-muted2)" }}>매입 통화
        <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-[12px] border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]" style={{ borderColor: "var(--c-border)", background: "var(--c-s1)", color: "var(--c-text)" }}>
          {[...new Set(["KRW", "USD", "EUR", "JPY", "CNY", "GBP", "CHF", "CAD", "AUD", currency])].map(code => <option key={code} value={code}>{code === "KRW" ? "KRW · 원화" : code}</option>)}
        </select>
      </label>}
      {fields.filter((field) => field.show).map((field) => (
        <label key={field.label} className="block text-xs" style={{ color: "var(--c-muted2)" }}>
          {field.label}
          <input
            type={field.type}
            min={field.type === "number" ? "0" : undefined}
            step={field.type === "number" ? "any" : undefined}
            value={field.value}
            onChange={(event) => field.set(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-[12px] border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]"
            style={{ borderColor: "var(--c-border)", background: "var(--c-s1)", color: "var(--c-text)" }}
          />
        </label>
      ))}
      {canEditPurchase && foreign && <div className="rounded-[12px] border px-3 py-2 sm:col-span-2" style={{ borderColor: "var(--c-border)", background: "var(--c-s1)" }}>
        <p className="text-xs" style={{ color: "var(--c-muted2)" }}>원화 환산 단가</p>
        <output aria-label="원화 환산 단가" className="mt-1 block text-base font-bold" style={{ color: "var(--c-blue)" }}>{converted === null ? "단가·환율 입력 필요" : `${costNumber(converted)} 원`}</output>
        <p className="mt-1 text-xs" style={{ color: "var(--c-muted2)" }}>외화 단가 × 적용 환율. 원화 소수 둘째 자리까지 반올림하여 원가에 반영합니다.</p>
      </div>}
    </fieldset>
    <p className="mt-3 text-xs leading-5" style={{ color: "var(--c-muted2)" }}>작업시간은 이 품목에서 한 사람이 1개를 만드는 데 추가로 드는 시간입니다. 회사 공통 시급을 바꾸면 모든 품목의 인건비에 적용됩니다.</p>
    {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--c-red)" }}>{error}</p>}
    <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-[12px] px-4 text-sm font-bold">닫기</button><button disabled={busy || !cost.can_edit} className="min-h-11 rounded-[12px] px-5 text-sm font-bold" style={{ background: "var(--c-blue-solid)", color: LEGACY_COLORS.white }}>{busy ? "저장 중…" : "기준값 저장"}</button></div>
  </form>;
}
