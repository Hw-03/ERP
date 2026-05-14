"use client";

import { useMemo, useState } from "react";
import { Ban, ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { ToastState } from "@/lib/ui/Toast";
import { useCurrentOperator } from "../../../login/useCurrentOperator";
import {
  isWarehouseStaff,
  WORK_TYPES,
  workTypesForOperator,
  type WorkType,
} from "../../../_warehouse_steps";
import { useWarehouseWizard } from "../../io/warehouse/context";
import type { TabId } from "../../MobileShell";
import { TYPO } from "../../tokens";
import { EmptyState, SectionHeader, SegmentedControl } from "../../primitives";
import { WarehouseWizardScreen } from "../../io/warehouse/WarehouseWizardScreen";
import { ApprovalQueuePanel } from "./ApprovalQueuePanel";
import { DraftsListPanel } from "./DraftsListPanel";
import { MyRequestsPanel } from "./MyRequestsPanel";

export type IoHubTab = "compose" | "drafts" | "myRequests" | "approvals";

const CAUTION_WORK_TYPES: WorkType[] = ["defective-register"];

export function IoHubScreen({
  showToast,
  onChangeTab,
}: {
  showToast: (toast: ToastState) => void;
  onChangeTab: (tab: TabId) => void;
}) {
  const operator = useCurrentOperator();
  const showApprovals = isWarehouseStaff(operator);
  const [tab, setTab] = useState<IoHubTab>("compose");
  const { state: wState, dispatch: wDispatch } = useWarehouseWizard();

  const allowedWorkTypes = useMemo(
    () => workTypesForOperator(operator),
    [operator],
  );

  const tabs = useMemo(
    () => [
      { id: "compose" as const, label: "작성" },
      { id: "drafts" as const, label: "이어쓰기" },
      { id: "myRequests" as const, label: "내 요청" },
      ...(showApprovals
        ? [{ id: "approvals" as const, label: "승인함" }]
        : []),
    ],
    [showApprovals],
  );

  const onPickWorkType = (wt: WorkType) => {
    switch (wt) {
      case "raw-io":
        wDispatch({ type: "SET_MODE", mode: "whin" });
        wDispatch({ type: "NEXT" });
        break;
      case "warehouse-io":
        wDispatch({ type: "SET_MODE", mode: "wh2d" });
        wDispatch({ type: "NEXT" });
        break;
      case "dept-adjustment":
        showToast({
          type: "info",
          message: "부서 입출고 화면으로 이동합니다.",
        });
        onChangeTab("dept");
        break;
      case "defective-register":
        showToast({
          type: "info",
          message: "불량 격리는 위험 작업 — 데스크탑에서 처리해 주세요.",
        });
        break;
    }
  };

  // 작성 진입 시 mode 미선택 + 첫 단계면 작업유형 카드 그리드. 그렇지 않으면 wizard.
  const showLanding = wState.mode == null && wState.step === 0;

  return (
    <div className="flex flex-col">
      <div
        className="sticky top-0 z-10 border-b px-3 pt-2 pb-2"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <SegmentedControl
          tabs={tabs}
          active={tab}
          onChange={(next) => setTab(next as IoHubTab)}
        />
      </div>

      {tab === "compose" ? (
        showLanding ? (
          <ComposeLanding
            allowedWorkTypes={allowedWorkTypes}
            onPick={onPickWorkType}
          />
        ) : (
          <WarehouseWizardScreen showToast={showToast} />
        )
      ) : null}
      {tab === "drafts" ? <DraftsListPanel showToast={showToast} /> : null}
      {tab === "myRequests" ? <MyRequestsPanel /> : null}
      {tab === "approvals" && showApprovals ? (
        <ApprovalQueuePanel showToast={showToast} />
      ) : null}
    </div>
  );
}

function ComposeLanding({
  allowedWorkTypes,
  onPick,
}: {
  allowedWorkTypes: WorkType[];
  onPick: (wt: WorkType) => void;
}) {
  if (allowedWorkTypes.length === 0) {
    return (
      <EmptyState
        icon={Ban}
        title="처리 가능한 작업유형 없음"
        description="현재 권한으로 처리 가능한 입출고 작업유형이 없습니다."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <SectionHeader
        subtitle="Compose"
        title="작업 유형 선택"
      />
      <div className="flex flex-col gap-2">
        {WORK_TYPES.map((wt) => {
          const enabled = allowedWorkTypes.includes(wt.id);
          const caution = CAUTION_WORK_TYPES.includes(wt.id);
          const Icon = wt.icon;
          const tone = caution
            ? (LEGACY_COLORS.red as string)
            : (LEGACY_COLORS.blue as string);
          return (
            <button
              key={wt.id}
              type="button"
              onClick={() => enabled && onPick(wt.id)}
              disabled={!enabled}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `${tone}22`, color: tone }}
              >
                <Icon size={22} strokeWidth={1.85} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`${TYPO.title} font-black`}
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {wt.label}
                  {caution ? (
                    <span
                      className={`${TYPO.caption} ml-2 rounded-full px-2 py-[1px] font-bold`}
                      style={{
                        background: `${LEGACY_COLORS.red as string}22`,
                        color: LEGACY_COLORS.red as string,
                      }}
                    >
                      위험
                    </span>
                  ) : null}
                </div>
                <div
                  className={TYPO.caption}
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  {wt.description}
                </div>
              </div>
              {enabled ? (
                <ChevronRight size={20} color={LEGACY_COLORS.muted as string} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
