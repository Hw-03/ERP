"use client";

import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  GitBranch,
  Inbox,
  KeyRound,
  Lock,
  LogOut,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { ToastState } from "@/lib/ui/Toast";
import { useCurrentOperator } from "../../login/useCurrentOperator";
import { isWarehouseStaff, canEnterIO } from "../../_warehouse_steps";
import type { TabId } from "../MobileShell";
import { TYPO } from "../tokens";
import { MoreMenuRow, PersonAvatar, SectionCard, SectionHeader } from "../primitives";
import { OperatorMenuSheet } from "./_more_parts/OperatorMenuSheet";
import { PlaceholderScreen } from "./_more_parts/PlaceholderScreen";
import { WeeklyReportScreen } from "./WeeklyReportScreen";

type Subscreen =
  | { kind: "menu" }
  | { kind: "weekly" }
  | { kind: "placeholder"; key: PlaceholderKey };

type PlaceholderKey = "bom";

const PLACEHOLDER_META: Record<
  PlaceholderKey,
  { title: string; subtitle: string; phaseLabel: string; icon: LucideIcon; description?: string }
> = {
  bom: {
    title: "BOM Workbench",
    subtitle: "BOM Setup",
    phaseLabel: "Phase 6",
    icon: GitBranch,
    description:
      "데스크탑 BOM Workbench가 확정된 뒤 모바일 축약 버전이 추가됩니다. 지금은 데스크탑에서 사용해 주세요.",
  },
};

export function MoreScreen({
  showToast,
  onChangeTab,
  onLoggedOut,
}: {
  showToast: (toast: ToastState) => void;
  onChangeTab: (tab: TabId) => void;
  onLoggedOut: () => void;
}) {
  const operator = useCurrentOperator();
  const [sub, setSub] = useState<Subscreen>({ kind: "menu" });
  const [menuOpen, setMenuOpen] = useState(false);

  const showApprovals = isWarehouseStaff(operator);
  const showMyRequests = canEnterIO(operator);

  if (sub.kind === "weekly") {
    return <WeeklyReportScreen onBack={() => setSub({ kind: "menu" })} />;
  }

  if (sub.kind === "placeholder") {
    const meta = PLACEHOLDER_META[sub.key];
    return (
      <PlaceholderScreen
        title={meta.title}
        subtitle={meta.subtitle}
        phaseLabel={meta.phaseLabel}
        icon={meta.icon}
        description={meta.description}
        onBack={() => setSub({ kind: "menu" })}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-4 py-4">
        {/* 담당자 카드 */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <PersonAvatar
            name={operator?.name ?? "—"}
            department={operator?.department}
            showLabel={false}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div
              className={`${TYPO.caption} font-semibold uppercase tracking-[1.2px]`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              로그인 담당자
            </div>
            <div
              className={`${TYPO.title} truncate font-black`}
              style={{ color: LEGACY_COLORS.text }}
            >
              {operator?.name ?? "—"}
            </div>
            <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              {operator?.department ?? ""}
              {operator?.warehouse_role && operator.warehouse_role !== "none"
                ? ` · 창고 ${operator.warehouse_role === "primary" ? "정" : "부"}`
                : ""}
            </div>
          </div>
          <span
            className={`${TYPO.caption} rounded-full border px-2 py-[3px] font-bold`}
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.blue as string,
            }}
          >
            메뉴
          </span>
        </button>

        {/* 업무 */}
        <div className="flex flex-col gap-2">
          <SectionHeader subtitle="Work" title="업무" />
          <div className="flex flex-col gap-2">
            {showMyRequests ? (
              <MoreMenuRow
                icon={Wrench}
                label="부서 입출고"
                description="부서 간 이동·패키지 출하"
                tone={LEGACY_COLORS.green as string}
                onClick={() => onChangeTab("dept")}
              />
            ) : null}
            <MoreMenuRow
              icon={CalendarDays}
              label="주간보고"
              description="모델·공정별 생산 현황"
              tone={LEGACY_COLORS.cyan as string}
              onClick={() => setSub({ kind: "weekly" })}
            />
            {showApprovals ? (
              <MoreMenuRow
                icon={Inbox}
                label="승인함"
                description="창고 결재 대기"
                tone={LEGACY_COLORS.yellow as string}
                onClick={() => onChangeTab("warehouse")}
              />
            ) : null}
            {showMyRequests ? (
              <MoreMenuRow
                icon={ClipboardList}
                label="내 요청"
                description="제출한 입출고 요청"
                tone={LEGACY_COLORS.blue as string}
                onClick={() => onChangeTab("warehouse")}
              />
            ) : null}
          </div>
        </div>

        {/* 관리 */}
        <div className="flex flex-col gap-2">
          <SectionHeader subtitle="Manage" title="관리" />
          <div className="flex flex-col gap-2">
            <MoreMenuRow
              icon={Lock}
              label="관리자"
              description="PIN 인증 후 품목·직원·BOM·설정"
              tone={LEGACY_COLORS.blue as string}
              onClick={() => onChangeTab("admin")}
            />
            <MoreMenuRow
              icon={GitBranch}
              label="BOM Workbench"
              description="모델·공정 BOM 매핑 (Phase 6 예정)"
              tone={LEGACY_COLORS.green as string}
              onClick={() => setSub({ kind: "placeholder", key: "bom" })}
            />
          </div>
        </div>

        {/* 시스템 */}
        <div className="flex flex-col gap-2 pb-2">
          <SectionHeader subtitle="System" title="시스템" />
          <SectionCard padding="md">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex items-center gap-3 rounded-[14px] px-2 py-2 text-left"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
                  style={{
                    background: `${LEGACY_COLORS.blue as string}22`,
                    color: LEGACY_COLORS.blue as string,
                  }}
                >
                  <KeyRound size={18} strokeWidth={1.85} />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={`${TYPO.body} font-black`}
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    내 PIN 변경
                  </div>
                  <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                    현재 PIN 확인 후 새 PIN 설정
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex items-center gap-3 rounded-[14px] px-2 py-2 text-left"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
                  style={{
                    background: `${LEGACY_COLORS.red as string}22`,
                    color: LEGACY_COLORS.red as string,
                  }}
                >
                  <LogOut size={18} strokeWidth={1.85} />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={`${TYPO.body} font-black`}
                    style={{ color: LEGACY_COLORS.red as string }}
                  >
                    로그아웃
                  </div>
                  <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                    세션 종료 후 로그인 화면으로
                  </div>
                </div>
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      <OperatorMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        operator={operator}
        onLoggedOut={() => {
          showToast({ type: "info", message: "로그아웃 되었습니다." });
          onLoggedOut();
        }}
        onPinChanged={() => showToast({ type: "info", message: "PIN이 변경되었습니다." })}
      />
    </>
  );
}
