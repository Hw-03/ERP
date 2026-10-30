"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import type { CostActor, CostPurchaseInfo as PurchaseInfo, CostPurchaseInfoPatch } from "@/lib/api/types/cost";
import { ApiError } from "@/lib/api-core";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useCostPurchaseInfoQuery, useSaveCostPurchaseInfoMutation } from "@/lib/queries/useCostQuery";
import { ItemStockPurchaseFields, Field, INPUT_CLASS, INPUT_STYLE, type StockPurchaseFormData } from "../_admin_sections/_master_items_parts/ItemStockPurchaseFields";
import { validateStockPurchaseValues } from "../_admin_hooks/itemStockPurchaseValidation";
import { convertedPrice } from "./CostStandardsEditor";
import { costNumber } from "./CostSummaryCard";

type EditState = { dirty: boolean; busy: boolean };
type Form = StockPurchaseFormData & { standard_yield_percent: string; standard_work_minutes: string; purchase_currency: string; foreign_purchase_price: string; purchase_exchange_rate: string };
const INTEGER_FIELDS = ["min_stock", "reorder_point", "procurement_lead_time_days", "minimum_order_quantity"] as const;
const TEXT_FIELDS = ["supplier", "supplier_item_code", "purchase_memo", "purchase_price_effective_date", "standard_work_minutes", "standard_yield_percent"] as const;
const FORM_FIELDS = [...INTEGER_FIELDS, ...TEXT_FIELDS, "standard_purchase_price", "purchase_currency", "foreign_purchase_price", "purchase_exchange_rate"] as const;
const BUTTON = "min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]";

function toForm(data: PurchaseInfo): Form {
  return Object.fromEntries(FORM_FIELDS.map(key => [key, String(data[key] ?? "")])) as Form;
}

/** Preserve omitted values, especially an unchanged foreign purchase source. */
function changedValues(form: Form, base: Form): CostPurchaseInfoPatch {
  const result: CostPurchaseInfoPatch = {};
  for (const key of TEXT_FIELDS) if (form[key] !== base[key]) result[key] = form[key].trim() || null;
  for (const key of INTEGER_FIELDS) if (form[key] !== base[key]) result[key] = form[key] === "" ? null : Number(form[key]);
  if (["standard_purchase_price", "purchase_currency", "foreign_purchase_price", "purchase_exchange_rate"].some(key => form[key as keyof Form] !== base[key as keyof Form])) {
    if (form.purchase_currency === "KRW") {
      result.standard_purchase_price = form.standard_purchase_price.trim() || null;
      if (base.purchase_currency !== "KRW") result.purchase_currency = "KRW";
    } else Object.assign(result, { purchase_currency: form.purchase_currency, foreign_purchase_price: form.foreign_purchase_price.trim(), purchase_exchange_rate: form.purchase_exchange_rate.trim() });
  }
  return result;
}

function accessDenied(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/** The tab is mounted only for managers; each server read/write checks that role again. */
export function CostPurchaseInfo({ itemId, actor, onStateChange, onAccessDenied }: {
  itemId: string; actor: CostActor; onStateChange: (state: EditState) => void; onAccessDenied: () => void;
}): ReactElement {
  const query = useCostPurchaseInfoQuery(itemId, actor);
  useEffect(() => { if (query.isError && accessDenied(query.error)) onAccessDenied(); }, [query.isError, query.error, onAccessDenied]);
  if (query.isError) return <div role="alert" className="p-5 text-sm"><p>{query.error.message}</p>{!accessDenied(query.error) && <button type="button" className={BUTTON} onClick={() => void query.refetch()}>정보 다시 불러오기</button>}</div>;
  if (query.data?.item_id !== itemId) return <p role="status" className="p-5 text-sm">정보를 불러오는 중입니다.</p>;
  return <PurchaseInfoForm key={`${actor.token}:${itemId}`} data={query.data} actor={actor} onStateChange={onStateChange} onAccessDenied={onAccessDenied} />;
}

function PurchaseInfoForm({ data, actor, onStateChange, onAccessDenied }: {
  data: PurchaseInfo; actor: CostActor; onStateChange: (state: EditState) => void; onAccessDenied: () => void;
}): ReactElement {
  const [form, setForm] = useState<Form>(() => toForm(data));
  const [base, setBase] = useState<Form>(() => toForm(data));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useSaveCostPurchaseInfoMutation(data.item_id, actor);
  const dirty = FORM_FIELDS.some(key => form[key] !== base[key]);
  const busy = mutation.isPending;
  const saving = useRef(false);
  const live = useRef(true);
  useLayoutEffect(() => { onStateChange({ dirty, busy }); }, [dirty, busy, onStateChange]);
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; onStateChange({ dirty: false, busy: false }); }; }, [onStateChange]);
  useEffect(() => { if (!dirty && !busy) { const next = toForm(data); setForm(next); setBase(next); } }, [data, dirty, busy]);
  const foreign = form.purchase_currency !== "KRW";
  const converted = foreign ? convertedPrice(form.foreign_purchase_price, form.purchase_exchange_rate) : null;

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving.current || !dirty) return;
    setError(null); setSaved(false);
    const validation = validateStockPurchaseValues(form);
    if (validation) { setError(validation); return; }
    if (form.standard_yield_percent !== "" && (!/^\d{1,3}(?:\.\d{1,2})?$/.test(form.standard_yield_percent) || Number(form.standard_yield_percent) <= 0 || Number(form.standard_yield_percent) > 100)) {
      setError("기준 수율은 0보다 크고 100 이하, 소수 둘째 자리까지 입력해 주세요."); return;
    }
    if (form.standard_work_minutes !== "" && !/^\d+(?:\.\d{1,2})?$/.test(form.standard_work_minutes.trim())) {
      setError("작업시간은 0 이상, 소수점 둘째 자리까지 입력해 주세요."); return;
    }
    if (foreign && converted === null) { setError("외화 단가와 0보다 큰 환율을 입력해 주세요."); return; }
    saving.current = true;
    try {
      const result = await mutation.mutateAsync(changedValues(form, base));
      if (live.current) { const next = toForm(result); setForm(next); setBase(next); setSaved(true); }
    } catch (failure) {
      if (live.current) {
        if (accessDenied(failure)) onAccessDenied();
        else setError(failure instanceof Error ? failure.message : "정보를 저장하지 못했습니다.");
      }
    } finally { saving.current = false; }
  }

  function input(label: string, key: keyof Form, type = "text", step?: string): ReactElement {
    return <Field label={label}><input aria-label={label} type={type} min={type === "number" ? 0 : undefined} step={step} value={form[key]} onChange={event => { const value = event.target.value; setForm(current => ({ ...current, [key]: value })); setSaved(false); }} className={INPUT_CLASS} style={INPUT_STYLE} /></Field>;
  }
  const priceFields = <>
    <Field label="매입 통화"><select aria-label="매입 통화" value={form.purchase_currency} onChange={event => setForm(current => ({ ...current, purchase_currency: event.target.value }))} className={INPUT_CLASS} style={INPUT_STYLE}>{[...new Set(["KRW", "USD", "EUR", "JPY", "CNY", "GBP", "CHF", "CAD", "AUD", form.purchase_currency])].map(code => <option key={code} value={code}>{code === "KRW" ? "KRW · 원화" : code}</option>)}</select></Field>
    {foreign ? input(`외화 매입단가 (${form.purchase_currency})`, "foreign_purchase_price", "number", "0.01") : input("기준 매입단가", "standard_purchase_price")}
    {foreign && input(`적용 환율 (원 / 1 ${form.purchase_currency})`, "purchase_exchange_rate", "number", "0.000001")}
    {input("단가 기준일", "purchase_price_effective_date", "date")}
    <p className="text-xs sm:col-span-2" style={{ color: "var(--c-muted2)" }}>{foreign ? `원화 환산 단가 ${converted === null ? "입력 필요" : `${costNumber(converted)} 원`} · 외화 단가 × 적용 환율` : `원 / ${data.unit} · 부가세 별도`}</p>
  </>;
  const laborFields = <section className="shrink-0 rounded-[16px] border p-4" style={{ background: "var(--c-s2)", borderColor: "var(--c-border)" }}>
    <h3 className="text-sm font-bold">작업·인건비 기준</h3>
    <div className="mt-3">{input("1인 1개 추가 작업시간 (분)", "standard_work_minutes", "number", "0.01")}</div>
    {data.process_type_code && ["TF", "NF"].includes(data.process_type_code) && <div className="mt-3">
      {input("원가 기준 수율 (%)", "standard_yield_percent")}
      <p className="mt-2 text-xs leading-5" style={{ color: "var(--c-muted2)" }}>원가 계산용 기준이며 실제 검사실적의 첫 통과율과 다릅니다. 빈 값은 미등록·100% 가정입니다. 엑셀 참고값: {data.process_type_code === "TF" ? "튜브 70%" : "발생부 90%"} · 자동 적용하지 않습니다.</p>
    </div>}
    <p className="mt-2 text-xs leading-5" style={{ color: "var(--c-muted2)" }}>이 단계에서 한 사람이 1개를 만드는 데 추가로 드는 시간입니다. 빈 값은 미등록, 0은 확인된 값으로 저장합니다. 가계도·표 상단의 가정 시급을 바꿔 원가를 계산할 수 있습니다.</p>
  </section>;
  return <form aria-label="원가분석 정보 수정" onSubmit={event => void save(event)} className="flex h-full min-h-0 w-full flex-col">
    <div className="relative min-h-0 flex-1">
    <fieldset disabled={busy} className="sg absolute inset-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]">
      <div className="flex min-h-full flex-col p-4" style={{ background: "var(--c-s1)" }}>
      <ItemStockPurchaseFields form={form} setForm={setForm} unit={data.unit} fillAvailableHeight purchasePriceFields={priceFields} additionalCriteria={laborFields} />
      </div>
    </fieldset>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t p-3" style={{ borderColor: "var(--c-border)", background: "var(--c-s1)" }}>
      {error && <p role="alert" className="mr-auto text-sm" style={{ color: "var(--c-red)" }}>{error}</p>}{saved && !dirty && <p role="status" className="mr-auto text-sm" style={{ color: "var(--c-green)" }}>저장했습니다.</p>}
      <button type="button" disabled={busy || !dirty} className={BUTTON} onClick={() => { setForm(base); setError(null); setSaved(false); }}>변경 취소</button>
      <button type="submit" disabled={busy || !dirty} className={`${BUTTON} px-6`} style={{ background: "var(--c-blue-solid)", color: LEGACY_COLORS.white }}>{busy ? "저장 중…" : "정보 저장"}</button>
    </footer>
  </form>;
}
