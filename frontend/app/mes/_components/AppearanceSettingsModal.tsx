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
  color: string;
};

type HoverableSettingsRow = "pin" | "login" | "admin";

const BRIGHT_YELLOW = `color-mix(in srgb, ${LEGACY_COLORS.yellow} 72%, ${LEGACY_COLORS.white})`;
const SETTINGS_ROW_SURFACE_CLASS = "min-h-[68px] w-full items-center gap-3 rounded-[16px] border p-3";

const THEME_OPTIONS: ChoiceOption<AppearancePreferences["theme"]>[] = [
  { value: "light", label: "라이트 테마", description: "밝은 화면", Icon: Sun, iconTestId: "appearance-choice-icon-light", color: BRIGHT_YELLOW },
  { value: "dark", label: "다크 테마", description: "어두운 화면", Icon: Moon, iconTestId: "appearance-choice-icon-dark", color: LEGACY_COLORS.text },
];

const SIDEBAR_OPTIONS: ChoiceOption<SidebarMode>[] = [
  { value: "hover", label: "자동 펼침", description: "마우스를 올리면 펼쳐집니다.", Icon: PanelLeftDashed, iconTestId: "appearance-choice-icon-hover", color: LEGACY_COLORS.cyan },
  { value: "collapsed", label: "접힘 고정", description: "항상 아이콘만 표시합니다.", Icon: PanelLeftClose, iconTestId: "appearance-choice-icon-collapsed", color: LEGACY_COLORS.blue },
  { value: "expanded", label: "펼침 고정", description: "항상 전체 메뉴를 표시합니다.", Icon: PanelLeftOpen, iconTestId: "appearance-choice-icon-expanded", color: LEGACY_COLORS.green },
];

export function DesktopSettingsView({
  preferences,
  onSave,
  canOpenAdmin = false,
  onOpenAdminPinEntry,
}: {
  preferences: AppearancePreferences;
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
  const [hoveredSettingsRow, setHoveredSettingsRow] = useState<HoverableSettingsRow | null>(null);
  const busy = saving || pinSaving || loginPopupSaving;

  const settingsRowBackground = (row: HoverableSettingsRow, color: string) => (
    hoveredSettingsRow === row
      ? `color-mix(in srgb, ${color} 8%, ${LEGACY_COLORS.s1})`
      : LEGACY_COLORS.s1
  );

  const resetPinSettings = useCallback(() => {
    setPinExpanded(false);
    setPinCurrent("");
    setPinNew("");
    setPinConfirm("");
    setPinFeedback(null);
  }, []);

  const cancelChanges = useCallback(() => {
    if (busy) return;
    setDraft(preferences);
    setError(null);
    resetPinSettings();
    setLoginPopupFeedback(null);
  }, [busy, preferences, resetPinSettings]);

  const closePinPopup = useCallback(() => {
    if (pinSaving) return;
    resetPinSettings();
  }, [pinSaving, resetPinSettings]);

  useEffect(() => {
    setDraft(preferences);
    setError(null);
    resetPinSettings();
    setLoginPopupFeedback(null);
  }, [preferences, resetPinSettings]);

  useEffect(() => {
    setLoginPopupEnabled(operator?.loginPopupEnabled ?? false);
  }, [operator?.employee_id, operator?.loginPopupEnabled]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pinExpanded) closePinPopup();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pinExpanded, closePinPopup]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch {
      setError("설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const openAdminPinEntry = () => {
    if (busy || !canOpenAdmin || !onOpenAdminPinEntry) return;
    onOpenAdminPinEntry();
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
      <section
        data-testid="desktop-settings-view"
        className="relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div data-testid="settings-layout" className="relative grid flex-1 content-start gap-y-6 overflow-y-auto px-4 py-6 lg:grid-cols-2 lg:grid-rows-2 lg:gap-x-8 sm:px-7 sm:py-8">
          <div
            aria-hidden="true"
            data-testid="settings-column-divider"
            className="pointer-events-none absolute inset-y-6 left-1/2 hidden -translate-x-px lg:block lg:border-l"
            style={{ borderColor: LEGACY_COLORS.border }}
          />
          <div data-testid="settings-left-column" className="contents">
          <SettingsCard testId="settings-theme-group" title="테마" className="lg:col-start-1 lg:row-start-1">
            <div className="space-y-3">
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

          <SettingsCard testId="settings-personal-group" title="개인 설정" className="lg:col-start-2 lg:row-start-1">
            <div className="space-y-3">
              <div data-testid="settings-pin-item">
                <button
                  type="button"
                  aria-label="PIN 재설정"
                  aria-expanded={pinExpanded}
                  disabled={!operator || busy}
                  onPointerEnter={() => setHoveredSettingsRow("pin")}
                  onPointerLeave={() => setHoveredSettingsRow(null)}
                  onClick={() => {
                    setPinExpanded(true);
                    setPinFeedback(null);
                  }}
                  className={`no-btn-inset flex ${SETTINGS_ROW_SURFACE_CLASS} text-left transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50`}
                  style={{ background: settingsRowBackground("pin", LEGACY_COLORS.purple), borderColor: LEGACY_COLORS.border }}
                >
                  <SettingsRowContent
                    testId="settings-row-content-pin"
                    label="PIN 재설정"
                    description="현재 PIN 확인 후 즉시 변경합니다."
                    Icon={KeyRound}
                    color={LEGACY_COLORS.purple}
                  />
                </button>

                {pinExpanded && (
                  <div
                    data-testid="settings-pin-popup-backdrop"
                    className="absolute inset-0 z-10 flex items-center justify-center p-4"
                    style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.bg} 82%, transparent)` }}
                    onClick={closePinPopup}
                  >
                    <section
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="settings-pin-popup-title"
                      className="w-full max-w-[min(820px,94vw)] rounded-[24px] border p-5 sm:p-7"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <header className="mb-5 flex items-center justify-between">
                        <h3 id="settings-pin-popup-title" className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>PIN 재설정</h3>
                        <button
                          type="button"
                          aria-label="PIN 재설정 닫기"
                          disabled={pinSaving}
                          onClick={closePinPopup}
                          className="no-btn-inset flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </header>
                  <div className="grid gap-3 sm:grid-cols-3">
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
                      {pinFeedback && (
                        <p
                          role={pinFeedback.tone === "error" ? "alert" : "status"}
                          className="mt-3 text-[12px] font-bold"
                          style={{ color: pinFeedback.tone === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
                        >
                          {pinFeedback.text}
                        </p>
                      )}
                    </section>
                  </div>
                )}
                {pinFeedback && !pinExpanded && (
                  <p
                    role={pinFeedback.tone === "error" ? "alert" : "status"}
                    className="mt-2 text-[12px] font-bold"
                    style={{ color: pinFeedback.tone === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
                  >
                    {pinFeedback.text}
                  </p>
                )}
              </div>

              <div
                data-testid="settings-login-popup-row"
                className={`flex ${SETTINGS_ROW_SURFACE_CLASS}`}
                style={{ background: settingsRowBackground("login", LEGACY_COLORS.green), borderColor: LEGACY_COLORS.border }}
                onPointerEnter={() => setHoveredSettingsRow("login")}
                onPointerLeave={() => setHoveredSettingsRow(null)}
              >
                <SettingsRowContent
                  testId="settings-row-content-login-popup"
                  label="로그인 알림 팝업"
                  description="로그인할 때 읽지 않은 알림을 바로 표시합니다."
                  Icon={BellRing}
                  color={LEGACY_COLORS.green}
                />
                <button
                  type="button"
                  role="switch"
                  aria-label="로그인 시 읽지 않은 알림 팝업"
                  aria-checked={loginPopupEnabled}
                  disabled={!operator || busy}
                  onClick={() => void handleLoginPopupToggle()}
                  className="no-btn-inset relative h-8 w-[52px] shrink-0 rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: loginPopupEnabled ? LEGACY_COLORS.green : LEGACY_COLORS.s3,
                  }}
                >
                  <span
                    className="absolute left-0.5 top-0.5 h-7 w-7 rounded-full shadow-sm transition-transform"
                    style={{
                      background: LEGACY_COLORS.white,
                      transform: loginPopupEnabled ? "translateX(20px)" : "translateX(0)",
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
          </div>

          <div data-testid="settings-right-column" className="contents">
            <SettingsCard testId="settings-sidebar-group" title="사이드바 표시 방식" className="lg:col-start-1 lg:row-start-2">
              <div className="space-y-3">
                {SIDEBAR_OPTIONS.map((option) => (
                  <ChoiceButton
                    key={option.value}
                    {...option}
                    selected={draft.sidebarMode === option.value}
                    disabled={busy}
                    onClick={() => setDraft((current) => ({ ...current, sidebarMode: option.value }))}
                  />
                ))}
              </div>
            </SettingsCard>

          {canOpenAdmin && (
            <SettingsCard testId="settings-admin-group" title="관리" className="lg:col-start-2 lg:row-start-2">
              <button
                type="button"
                aria-label="관리"
                disabled={busy}
                onPointerEnter={() => setHoveredSettingsRow("admin")}
                onPointerLeave={() => setHoveredSettingsRow(null)}
                onClick={openAdminPinEntry}
                className={`no-btn-inset flex ${SETTINGS_ROW_SURFACE_CLASS} text-left transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50`}
                style={{ background: settingsRowBackground("admin", LEGACY_COLORS.muted2), borderColor: LEGACY_COLORS.border }}
              >
                <SettingsRowContent
                  testId="settings-row-content-admin"
                  label="관리"
                  description="PIN을 입력해 시작합니다."
                  Icon={Settings2}
                  color={LEGACY_COLORS.muted2}
                />
              </button>
            </SettingsCard>
          )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t px-4 py-4 sm:px-7 sm:py-5" style={{ borderColor: LEGACY_COLORS.border }}>
          {error && <p role="alert" className="mr-auto text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={cancelChanges}
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
  );
}

function SettingsCard({
  testId,
  title,
  className,
  children,
}: {
  testId: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className={className}>
      <div className="flex items-center gap-3">
        <h3 className="shrink-0 text-lg font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h3>
        <span data-testid={`${testId}-divider`} className="flex-1 border-t" style={{ borderColor: LEGACY_COLORS.border }} />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChoiceButton({
  value,
  label,
  description,
  Icon,
  iconTestId,
  color,
  selected,
  disabled,
  onClick,
}: ChoiceOption<string> & {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`no-btn-inset flex ${SETTINGS_ROW_SURFACE_CLASS} text-left transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50`}
      style={{
        borderColor: LEGACY_COLORS.border,
        background: selected
          ? `color-mix(in srgb, ${color} 12%, transparent)`
          : hovered
            ? `color-mix(in srgb, ${color} 8%, ${LEGACY_COLORS.s1})`
            : LEGACY_COLORS.s1,
      }}
    >
      <SettingsRowContent
        testId={`settings-row-content-theme-${value}`}
        label={label}
        description={description}
        Icon={Icon}
        iconTestId={iconTestId}
        color={color}
        selected={selected}
        trailing={selected ? <Check className="h-5 w-5 shrink-0" style={{ color }} /> : undefined}
      />
    </button>
  );
}

function SettingsRowContent({
  testId,
  label,
  description,
  Icon,
  color,
  iconTestId,
  selected = false,
  trailing,
}: {
  testId: string;
  label: string;
  description: string;
  Icon: ElementType;
  color: string;
  iconTestId?: string;
  selected?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          background: selected ? `color-mix(in srgb, ${color} 14%, transparent)` : LEGACY_COLORS.s2,
          color,
        }}
      >
        <Icon data-testid={iconTestId} className="h-5 w-5" />
      </span>
      <span data-testid={testId} className="min-w-0 flex-1">
        <span className="block text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>{label}</span>
        <span className="mt-0.5 block text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>{description}</span>
      </span>
      {trailing}
    </>
  );
}
