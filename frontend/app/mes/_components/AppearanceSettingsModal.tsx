"use client";

import { useCallback, useEffect, useState, type ElementType, type ReactNode } from "react";
import { BellRing, Check, KeyRound, Moon, PanelLeftClose, PanelLeftDashed, PanelLeftOpen, Settings2, Sun, X } from "lucide-react";
import { api } from "@/lib/api";
import { employeesApi } from "@/lib/api/employees";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { SidebarMode } from "@/lib/sidebar-mode";
import { updateCurrentOperatorPreferences, useCurrentOperator } from "./login/useCurrentOperator";
import type { AppearancePreferences } from "./useAppearancePreferences";

export type { AppearancePreferences } from "./useAppearancePreferences";

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  Icon: ElementType;
  iconTestId: string;
};

const THEME_OPTIONS: ChoiceOption<AppearancePreferences["theme"]>[] = [
  { value: "light", label: "라이트 테마", description: "밝은 화면", Icon: Sun, iconTestId: "appearance-choice-icon-light" },
  { value: "dark", label: "다크 테마", description: "어두운 화면", Icon: Moon, iconTestId: "appearance-choice-icon-dark" },
];

const SIDEBAR_OPTIONS: ChoiceOption<SidebarMode>[] = [
  { value: "hover", label: "자동 펼침", description: "마우스를 올리면 펼쳐집니다.", Icon: PanelLeftDashed, iconTestId: "appearance-choice-icon-hover" },
  { value: "collapsed", label: "접힘 고정", description: "항상 아이콘만 표시합니다.", Icon: PanelLeftClose, iconTestId: "appearance-choice-icon-collapsed" },
  { value: "expanded", label: "펼침 고정", description: "항상 전체 메뉴를 표시합니다.", Icon: PanelLeftOpen, iconTestId: "appearance-choice-icon-expanded" },
];

export function AppearanceSettingsModal({
  open,
  preferences,
  onClose,
  onSave,
  canOpenAdmin = false,
  onOpenAdminPinEntry,
}: {
  open: boolean;
  preferences: AppearancePreferences;
  onClose: () => void;
  onSave: (next: AppearancePreferences) => Promise<void>;
  canOpenAdmin?: boolean;
  onOpenAdminPinEntry?: () => void;
}) {
  const operator = useCurrentOperator();
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinExpanded, setPinExpanded] = useState(false);
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loginPopupEnabled, setLoginPopupEnabled] = useState(false);
  const [loginPopupSaving, setLoginPopupSaving] = useState(false);
  const [loginPopupFeedback, setLoginPopupFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const busy = saving || pinSaving || loginPopupSaving;

  const resetPinSettings = useCallback(() => {
    setPinExpanded(false);
    setPinCurrent("");
    setPinNew("");
    setPinConfirm("");
    setPinFeedback(null);
  }, []);

  const closeWithoutSaving = useCallback(() => {
    if (busy) return;
    resetPinSettings();
    onClose();
  }, [busy, onClose, resetPinSettings]);

  useEffect(() => {
    if (!open) {
      resetPinSettings();
      return;
    }
    setDraft(preferences);
    setError(null);
    resetPinSettings();
    setLoginPopupFeedback(null);
  }, [open, preferences, resetPinSettings]);

  useEffect(() => {
    if (!open) return;
    setLoginPopupEnabled(operator?.loginPopupEnabled ?? false);
  }, [open, operator?.employee_id, operator?.loginPopupEnabled]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWithoutSaving();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, closeWithoutSaving]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      closeWithoutSaving();
    } catch {
      setError("설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const openAdminPinEntry = () => {
    if (busy || !canOpenAdmin || !onOpenAdminPinEntry) return;
    onOpenAdminPinEntry();
    closeWithoutSaving();
  };

  const handlePinChange = async () => {
    if (!operator || pinSaving) return;
    setPinFeedback(null);
    if (pinNew !== pinConfirm) {
      setPinFeedback({ tone: "error", text: "새 PIN과 확인 PIN이 일치하지 않습니다." });
      return;
    }
    if (pinCurrent.length !== PIN_LENGTH || pinNew.length !== PIN_LENGTH) {
      setPinFeedback({ tone: "error", text: `PIN은 ${PIN_LENGTH}자리 숫자여야 합니다.` });
      return;
    }
    setPinSaving(true);
    try {
      await api.changeMyPin(operator.employee_id, pinCurrent, pinNew);
      setPinCurrent("");
      setPinNew("");
      setPinConfirm("");
      setPinExpanded(false);
      setPinFeedback({ tone: "success", text: "PIN이 변경되었습니다." });
    } catch (pinError) {
      setPinFeedback({
        tone: "error",
        text: pinError instanceof Error ? pinError.message : "PIN 변경에 실패했습니다.",
      });
    } finally {
      setPinSaving(false);
    }
  };

  const handleLoginPopupToggle = async () => {
    if (!operator || loginPopupSaving) return;
    const nextEnabled = !loginPopupEnabled;
    setLoginPopupSaving(true);
    setLoginPopupFeedback(null);
    try {
      await employeesApi.setLoginPopup(operator.employee_id, nextEnabled);
      updateCurrentOperatorPreferences({ loginPopupEnabled: nextEnabled });
      setLoginPopupEnabled(nextEnabled);
      setLoginPopupFeedback({ tone: "success", text: "알림 팝업 설정을 저장했습니다." });
    } catch {
      setLoginPopupFeedback({ tone: "error", text: "알림 팝업 설정을 저장하지 못했습니다." });
    } finally {
      setLoginPopupSaving(false);
    }
  };

  const pinSubmitDisabled =
    pinSaving ||
    pinCurrent.length !== PIN_LENGTH ||
    pinNew.length !== PIN_LENGTH ||
    pinConfirm.length !== PIN_LENGTH;

  return (
    <div
      data-testid="appearance-settings-backdrop"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: LEGACY_COLORS.bg }}
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
                화면 표시와 개인 설정을 관리하세요.
              </p>
            </div>
            <button
              type="button"
              aria-label="닫기"
              disabled={busy}
              onClick={closeWithoutSaving}
              className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`, color: LEGACY_COLORS.red }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-5 overflow-y-auto px-4 py-6 lg:grid-cols-2 sm:px-7 sm:py-8">
          <SettingsCard title="테마" description="화면 색상을 선택합니다.">
            <div className="grid grid-cols-2 gap-3">
              {THEME_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  {...option}
                  selected={draft.theme === option.value}
                  disabled={busy}
                  onClick={() => setDraft((current) => ({ ...current, theme: option.value }))}
                />
              ))}
            </div>
          </SettingsCard>

          <SettingsCard title="사이드바 표시 방식" description="데스크톱 왼쪽 메뉴의 펼침 방식을 선택합니다.">
            <div className="space-y-3">
              {SIDEBAR_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  {...option}
                  selected={draft.sidebarMode === option.value}
                  disabled={busy}
                  onClick={() => setDraft((current) => ({ ...current, sidebarMode: option.value }))}
                  wide
                />
              ))}
            </div>
          </SettingsCard>

          <SettingsCard title="개인 설정" description="내 PIN과 로그인 알림 표시를 관리합니다.">
            <div className="space-y-3">
              <div className="rounded-2xl border p-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                <button
                  type="button"
                  aria-label="PIN 재설정"
                  aria-expanded={pinExpanded}
                  disabled={!operator || busy}
                  onClick={() => {
                    setPinExpanded((current) => !current);
                    setPinFeedback(null);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.cyan }}>
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>PIN 재설정</span>
                    <span className="mt-0.5 block text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>현재 PIN 확인 후 즉시 변경합니다.</span>
                  </span>
                </button>

                {pinExpanded && (
                  <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3" style={{ borderColor: LEGACY_COLORS.border }}>
                    {[
                      { id: "settings-pin-current", label: "현재 PIN", value: pinCurrent, onChange: setPinCurrent },
                      { id: "settings-pin-new", label: "새 PIN", value: pinNew, onChange: setPinNew },
                      { id: "settings-pin-confirm", label: "새 PIN 확인", value: pinConfirm, onChange: setPinConfirm },
                    ].map(({ id, label, value, onChange }) => (
                      <div key={id}>
                        <label htmlFor={id} className="mb-1 block text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{label}</label>
                        <input
                          id={id}
                          type="password"
                          inputMode="numeric"
                          pattern={`\\d{${PIN_LENGTH}}`}
                          maxLength={PIN_LENGTH}
                          value={value}
                          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
                          className="min-h-11 w-full rounded-xl border px-3 text-[14px] outline-none focus:border-[var(--c-blue)]"
                          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={pinSubmitDisabled}
                      onClick={() => void handlePinChange()}
                      className="min-h-11 rounded-xl px-4 text-[14px] font-black text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-3"
                      style={{ background: LEGACY_COLORS.blueSolid }}
                    >
                      {pinSaving ? "PIN 변경 중…" : "PIN 변경 저장"}
                    </button>
                  </div>
                )}
                {pinFeedback && (
                  <p
                    role={pinFeedback.tone === "error" ? "alert" : "status"}
                    className="mt-2 text-[12px] font-bold"
                    style={{ color: pinFeedback.tone === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
                  >
                    {pinFeedback.text}
                  </p>
                )}
              </div>

              <div className="flex min-h-[68px] items-center gap-3 rounded-2xl border p-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.cyan }}>
                  <BellRing className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>로그인 알림 팝업</span>
                  <span className="mt-0.5 block text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>로그인할 때 읽지 않은 알림을 바로 표시합니다.</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-label="로그인 시 읽지 않은 알림 팝업"
                  aria-checked={loginPopupEnabled}
                  disabled={!operator || busy}
                  onClick={() => void handleLoginPopupToggle()}
                  className="relative h-11 w-[60px] shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: loginPopupEnabled ? LEGACY_COLORS.cyan : LEGACY_COLORS.s2,
                    borderColor: loginPopupEnabled ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
                  }}
                >
                  <span
                    className="absolute top-[7px] h-7 w-7 rounded-full transition-transform"
                    style={{
                      left: 7,
                      background: LEGACY_COLORS.white,
                      transform: loginPopupEnabled ? "translateX(18px)" : "translateX(0)",
                    }}
                  />
                </button>
              </div>
              {loginPopupFeedback && (
                <p
                  role={loginPopupFeedback.tone === "error" ? "alert" : "status"}
                  className="px-1 text-[12px] font-bold"
                  style={{ color: loginPopupFeedback.tone === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
                >
                  {loginPopupFeedback.text}
                </p>
              )}
            </div>
          </SettingsCard>

          {canOpenAdmin && (
            <SettingsCard title="관리" description="마스터와 운영 설정으로 이동합니다.">
              <button
                type="button"
                aria-label="관리"
                disabled={busy}
                onClick={openAdminPinEntry}
                className="flex min-h-[210px] w-full flex-col items-center justify-center rounded-2xl border p-5 text-center transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.cyan }}
              >
                <Settings2 className="h-10 w-10" />
                <span className="mt-4 text-lg font-black" style={{ color: LEGACY_COLORS.text }}>관리</span>
                <span className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>PIN을 입력해 시작합니다.</span>
              </button>
            </SettingsCard>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t px-4 py-4 sm:px-7 sm:py-5" style={{ borderColor: LEGACY_COLORS.border }}>
          {error && <p role="alert" className="mr-auto text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={closeWithoutSaving}
            className="rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
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

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
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
  Icon,
  iconTestId,
  selected,
  disabled,
  onClick,
  wide = false,
}: ChoiceOption<string> & {
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
      className={`flex min-h-[82px] items-center rounded-2xl border p-4 text-left transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${wide ? "w-full" : ""}`}
      style={{
        borderColor: selected ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
        background: selected ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 12%, transparent)` : LEGACY_COLORS.s1,
      }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          background: selected ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 14%, transparent)` : LEGACY_COLORS.s2,
          color: selected ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
        }}
      >
        <Icon data-testid={iconTestId} className="h-6 w-6" />
      </span>
      <span className="ml-3 min-w-0 flex-1">
        <span className="block font-black" style={{ color: LEGACY_COLORS.text }}>{label}</span>
        <span className="mt-1 block text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{description}</span>
      </span>
      {selected && <Check className="ml-3 h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.cyan }} />}
    </button>
  );
}
