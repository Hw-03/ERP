"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { itemSearchApi } from "@/lib/api/item-search";
import { useItemSearch, useItemSearchSave } from "@/lib/queries/useItemSearch";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SearchConfigStatus } from "./SearchConfigStatus";

/** Item-specific aliases are search metadata; the official item name stays visible. */
export function ItemSearchAliases({ itemId, disabled = false }: { itemId: string; disabled?: boolean }) {
  const { config, ready } = useItemSearch();
  const save = useItemSearchSave();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliases = config.item_aliases[itemId] ?? [];
  async function change(operation: () => Promise<unknown>, clearDraft = false): Promise<void> {
    setPending(true); setError(null);
    try { await save(operation); if (clearDraft) setDraft(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "검색용 이름을 저장하지 못했습니다."); }
    finally { setPending(false); }
  }
  return <section aria-label="검색용 이름" className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
    <h3 className="text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>검색용 이름</h3>
    <p className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>이 품목을 찾을 때 쓰는 다른 이름을 등록합니다.</p>
    <SearchConfigStatus />
    <div className="mt-3 flex flex-wrap gap-2">
      {aliases.map((entry) => <span key={entry.alias_id} className="inline-flex items-center rounded-full border pl-3 text-sm" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {entry.alias}<button type="button" aria-label={`${entry.alias} 삭제`} disabled={disabled || pending || !ready} onClick={() => void change(() => itemSearchApi.deleteAlias(itemId, entry.alias_id))}
          className="flex h-11 w-11 items-center justify-center rounded-full active:scale-95 disabled:opacity-50" style={{ color: LEGACY_COLORS.muted2 }}><X size={16} /></button>
      </span>)}
      {ready && aliases.length === 0 && <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 검색용 이름이 없습니다.</p>}
    </div>
    <form className="mt-3 flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !pending && !disabled && ready) void change(() => itemSearchApi.addAlias(itemId, draft.trim()), true); }}>
      <input aria-label="검색용 이름 추가" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={disabled || pending} maxLength={200} placeholder="다른 이름 입력"
        className="h-11 min-w-0 flex-1 rounded-[12px] border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] disabled:opacity-50"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
      <button aria-label="검색용 이름 추가" disabled={disabled || pending || !ready || !draft.trim()} className="min-h-11 rounded-[12px] px-3 text-sm font-semibold active:scale-[0.98] disabled:opacity-50" style={{ background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }}>추가</button>
    </form>
    {error && <p role="alert" className="mt-2 text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
  </section>;
}
