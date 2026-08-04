"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { SidebarMode } from "@/lib/sidebar-mode";
import type { AppearancePreferences } from "./useAppearancePreferences";

export type { AppearancePreferences } from "./useAppearancePreferences";

const SIDEBAR_OPTIONS: Array<{ value: SidebarMode; label: string; description: string }> = [
  { value: "hover", label: "자동 펼침", description: "평소에는 접혀 있고 마우스를 올리면 펼쳐집니다." },
  { value: "collapsed", label: "접힘 고정", description: "항상 아이콘만 표시합니다." },
  { value: "expanded", label: "펼침 고정", description: "항상 전체 메뉴를 표시합니다." },
];

export function AppearanceSettingsModal({
  open,
  preferences,
  onClose,
  onSave,
}: {
  open: boolean;
  preferences: AppearancePreferences;
  onClose: () => void;
  onSave: (next: AppearancePreferences) => Promise<void>;
}) {
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(preferences);
    setError(null);
  }, [open, preferences]);

  if (!open) return null;

  const closeWithoutSaving = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch {
      setError("설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={closeWithoutSaving}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="appearance-settings-title"
        className="flex h-[min(900px,92vh)] w-full max-w-[min(1600px,97vw)] flex-col rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b px-4 pb-3 pt-4 sm:px-7 sm:pb-5 sm:pt-7" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 id="appearance-settings-title" className="text-lg font-black sm:text-2xl" style={{ color: LEGACY_COLORS.text }}>
                설정
              </h2>
              <p className="mt-1 text-sm sm:text-base" style={{ color: LEGACY_COLORS.muted2 }}>
                화면과 사이드바 표시 방식을 선택하세요.
              </p>
            </div>
            <button
              type="button"
              aria-label="닫기"
              disabled={saving}
              onClick={closeWithoutSaving}
              className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`, color: LEGACY_COLORS.red }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid flex-1 content-center gap-5 overflow-y-auto px-4 py-6 sm:grid-cols-2 sm:px-7 sm:py-8">
          <SettingsCard title="테마" description="화면 색상을 선택합니다.">
            <div className="grid grid-cols-2 gap-3">
              <ChoiceButton
                label="라이트 테마"
                description="밝은 화면"
                selected={draft.theme === "light"}
                disabled={saving}
                onClick={() => setDraft((current) => ({ ...current, theme: "light" }))}
              />
              <ChoiceButton
                label="다크 테마"
                description="어두운 화면"
                selected={draft.theme === "dark"}
                disabled={saving}
                onClick={() => setDraft((current) => ({ ...current, theme: "dark" }))}
              />
            </div>
          </SettingsCard>

          <SettingsCard title="사이드바 표시 방식" description="데스크톱 왼쪽 메뉴의 펼침 방식을 선택합니다.">
            <div className="space-y-3">
              {SIDEBAR_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  selected={draft.sidebarMode === option.value}
                  disabled={saving}
                  onClick={() => setDraft((current) => ({ ...current, sidebarMode: option.value }))}
                  wide
                />
              ))}
            </div>
          </SettingsCard>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t px-4 py-4 sm:px-7 sm:py-5" style={{ borderColor: LEGACY_COLORS.border }}>
          {error && <p role="alert" className="mr-auto text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
          <button
            type="button"
            disabled={saving}
            onClick={closeWithoutSaving}
            className="rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-xl px-5 py-3 text-sm font-black transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: LEGACY_COLORS.white, background: LEGACY_COLORS.blueSolid }}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border p-5 sm:p-6" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <h3 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h3>
      <p className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ChoiceButton({
  label,
  description,
  selected,
  disabled,
  onClick,
  wide = false,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[82px] items-start rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${wide ? "w-full" : ""}`}
      style={{
        borderColor: selected ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
        background: selected ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 12%, transparent)` : LEGACY_COLORS.s1,
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-black" style={{ color: LEGACY_COLORS.text }}>{label}</span>
        <span className="mt-1 block text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{description}</span>
      </span>
      {selected && <Check className="ml-3 h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.cyan }} />}
    </button>
  );
}
