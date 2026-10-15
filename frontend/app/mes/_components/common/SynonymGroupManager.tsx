"use client";
import { useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { itemSearchApi } from "@/lib/api/item-search";
import type { ItemSearchSynonymGroup } from "@/lib/api/types/item-search";
import { ApiError } from "@/lib/api-core";
import { useItemSearch, useItemSearchSave } from "@/lib/queries/useItemSearch";
import { normalizeSearchText } from "@/lib/searchText";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SearchConfigStatus } from "./SearchConfigStatus";

type TermField = { key: number; value: string };
type Draft = { fields: TermField[]; expectedVersion?: number };
const MAX_TERMS = 50;
const MAX_TERM_LENGTH = 200;
const editorClass = "h-11 w-full min-w-0 rounded-[12px] border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] disabled:opacity-50";
const editorStyle = { background: LEGACY_COLORS.s1, color: LEGACY_COLORS.text, borderColor: LEGACY_COLORS.border };
const buttonClass = "min-h-11 rounded-[12px] border px-3 text-sm font-semibold active:scale-[0.98] disabled:opacity-50";
const cardStyle = { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border };
const primaryStyle = { borderColor: LEGACY_COLORS.blue, background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white };

function makeFields(terms: string[]): TermField[] {
  return Array.from({ length: Math.max(2, terms.length) }, (_, key) => ({ key, value: terms[key] ?? "" }));
}
function fieldTerms(fields: TermField[]): string[] {
  return fields.map(field => field.value.trim()).filter(Boolean);
}
/** Validate the same normalized natural keys as the API before submitting. */
function termsError(fields: TermField[], groups: ItemSearchSynonymGroup[], ownId?: string): string | null {
  const terms = fieldTerms(fields);
  const keys = terms.map(normalizeSearchText);
  if (terms.some(term => term.length > MAX_TERM_LENGTH)) return `검색어는 ${MAX_TERM_LENGTH}자까지 입력할 수 있습니다.`;
  if (keys.some(key => !key)) return "검색할 수 있는 단어나 문구를 입력해 주세요.";
  if (new Set(keys).size !== keys.length) return "이미 입력한 검색어와 같은 표현이 있습니다. 하나만 남겨 주세요.";
  const otherKeys = new Set(groups.filter(group => group.group_id !== ownId).flatMap(group => group.terms.map(normalizeSearchText)));
  if (keys.some(key => otherKeys.has(key))) return "이미 다른 연결에 등록된 검색어입니다. 기존 연결에서 수정해 주세요.";
  return null;
}

/** One field is one phrase; stable row keys preserve remaining input on removal. */
function TermEditor({ fields, onChange, groups, ownId, disabled, readOnly = false }: {
  fields: TermField[]; onChange: (fields: TermField[]) => void; groups: ItemSearchSynonymGroup[];
  ownId?: string; disabled: boolean; readOnly?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const terms = fieldTerms(fields);
  const error = readOnly ? null : termsError(fields, groups, ownId);
  function focusField(index: number): void {
    requestAnimationFrame(() => root.current?.querySelectorAll<HTMLInputElement>("input")[index]?.focus());
  }
  return <div ref={root} className="space-y-3">
    {fields.map((field, index) => {
      const label = index === 0 ? "검색어" : index === 1 ? "같은 뜻의 다른 표현" : `다른 표현 ${index}`;
      return <div key={field.key}>
        <label htmlFor={`${id}-${field.key}`} className="mb-1.5 block text-sm font-semibold">{label}</label>
        <div className="flex items-center gap-2">
          <input id={`${id}-${field.key}`} value={field.value} readOnly={readOnly} disabled={disabled} maxLength={MAX_TERM_LENGTH}
            placeholder={index === 0 ? "예: 배터리" : index === 1 ? "예: battery" : "예: 밧데리"}
            aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
            className={editorClass} style={editorStyle}
            onChange={event => onChange(fields.map(row => row.key === field.key ? { ...row, value: event.target.value } : row))} />
          {!readOnly && index > 1 && <button type="button" aria-label={`${label} 삭제`} disabled={disabled}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border disabled:opacity-50"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }} onClick={() => {
              onChange(fields.filter(row => row.key !== field.key));
              focusField(Math.min(index, fields.length - 2));
            }}><X size={16} aria-hidden /></button>}
        </div>
      </div>;
    })}
    {!readOnly && <button type="button" disabled={disabled || fields.length >= MAX_TERMS}
      className={`${buttonClass} flex w-full items-center justify-center gap-2`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
      onClick={() => {
        onChange([...fields, { key: Math.max(...fields.map(field => field.key)) + 1, value: "" }]);
        focusField(fields.length);
      }}><Plus size={16} aria-hidden />다른 표현 추가</button>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
    {terms.length > 0 && <div className="rounded-[12px] border p-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <p className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>연결 미리보기</p>
      <p className="mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.blue }}>{terms.join(" ↔ ")}</p>
    </div>}
  </div>;
}

/** Keep the editing version and local fields intact when shared settings refresh. */
export function SynonymGroupManager() {
  const { config, ready } = useItemSearch();
  const save = useItemSearchSave();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newFields, setNewFields] = useState<TermField[]>(() => makeFields([]));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function discardDraft(id: string): void {
    setDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
    setError(null);
  }
  async function change(operation: () => Promise<unknown>, id?: string): Promise<void> {
    setPending(true); setError(null);
    try {
      await save(operation);
      if (id) discardDraft(id);
      else setNewFields(makeFields([]));
    } catch (failure) {
      const conflict = failure instanceof ApiError && failure.isConflict;
      setError(`${failure instanceof Error ? failure.message : "검색어 연결을 저장하지 못했습니다."}${conflict ? " 최신 저장 내용을 확인한 뒤 다시 저장해 주세요. 입력은 보존했습니다." : ""}`);
      if (conflict && id) setDrafts(previous => previous[id] ? { ...previous, [id]: { fields: previous[id].fields } } : previous);
    } finally { setPending(false); }
  }
  const canCreate = ready && !pending && fieldTerms(newFields).length >= 2 && !termsError(newFields, config.synonym_groups);
  return <div className="space-y-4">
    <SearchConfigStatus />
    {error && <p role="alert" className="text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
    <section aria-label="새 검색어 연결" className="h-[298px] rounded-[20px] border p-4" style={cardStyle}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={event => { event.preventDefault(); if (canCreate) void change(() => itemSearchApi.addGroup(fieldTerms(newFields))); }}>
        <div className="sg min-h-0 flex-1 overflow-y-auto">
          <TermEditor fields={newFields} onChange={setNewFields} groups={config.synonym_groups} disabled={pending} />
        </div>
        <button type="submit" disabled={!canCreate} className={`${buttonClass} mt-3 w-full shrink-0`} style={primaryStyle}>연결 저장</button>
      </form>
    </section>
    {config.synonym_groups.length > 0 && <h3 className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>등록된 연결</h3>}
    {config.synonym_groups.map(group => {
      const draft = drafts[group.group_id];
      const canUpdate = draft && ready && !pending && fieldTerms(draft.fields).length >= 2 && !termsError(draft.fields, config.synonym_groups, group.group_id);
      return <section key={group.group_id} aria-label={`검색어 연결: ${group.terms.join(", ")}`} className="rounded-[20px] border p-4" style={cardStyle}>
        <h3 className="break-words text-base font-semibold [overflow-wrap:anywhere]">{group.terms.join(" ↔ ")}</h3>
        {draft ? <form className="mt-3" onSubmit={event => {
          event.preventDefault();
          if (canUpdate) void change(() => itemSearchApi.updateGroup(group.group_id, fieldTerms(draft.fields), draft.expectedVersion ?? group.version), group.group_id);
        }}>
          <p className="mb-3 break-words text-sm [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.muted2 }}>현재 저장: {group.terms.join(" ↔ ")}</p>
          <TermEditor fields={draft.fields} groups={config.synonym_groups} ownId={group.group_id} disabled={pending}
            onChange={fields => setDrafts(previous => ({ ...previous, [group.group_id]: { ...previous[group.group_id], fields } }))} />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={() => discardDraft(group.group_id)} className={`${buttonClass} flex-1`} style={{ borderColor: LEGACY_COLORS.border }}>취소</button>
            <button type="submit" disabled={!canUpdate} className={`${buttonClass} flex-1`} style={primaryStyle}>수정 완료</button>
          </div>
        </form> : <div className="mt-3 flex gap-2">
          <button type="button" disabled={pending || !ready} className={`${buttonClass} flex-1`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
            onClick={() => { setError(null); setDrafts(previous => ({ ...previous, [group.group_id]: { fields: makeFields(group.terms), expectedVersion: group.version } })); }}>수정</button>
          <button type="button" disabled={pending || !ready} className={`${buttonClass} flex-1`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}
            onClick={() => void change(() => itemSearchApi.deleteGroup(group.group_id, group.version), group.group_id)}>연결 해제</button>
        </div>}
      </section>;
    })}
    {Object.entries(drafts).filter(([id]) => !config.synonym_groups.some(group => group.group_id === id)).map(([id, draft]) => <section key={id} aria-label="삭제된 연결의 입력" className="space-y-3 rounded-[20px] border p-4" style={cardStyle}>
      <h3 className="text-base font-semibold">삭제된 연결의 입력</h3>
      <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>다른 직원이 연결을 해제했습니다. 입력을 복사해 새 연결에 사용할 수 있습니다.</p>
      <TermEditor fields={draft.fields} groups={[]} onChange={() => {}} disabled={false} readOnly />
    </section>)}
  </div>;
}
