"use client";

import { useState } from "react";
import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { ToastState } from "@/lib/ui/Toast";
import { useCurrentOperator } from "../../../login/useCurrentOperator";
import { isWarehouseStaff } from "../../../_warehouse_steps";
import { TYPO } from "../../tokens";
import { WarehouseWizardScreen } from "../../io/warehouse/WarehouseWizardScreen";
import { ApprovalQueuePanel } from "./ApprovalQueuePanel";
import { DraftsListPanel } from "./DraftsListPanel";
import { MyRequestsPanel } from "./MyRequestsPanel";

export type IoHubTab = "compose" | "drafts" | "myRequests" | "approvals";

interface TabSpec {
  id: IoHubTab;
  label: string;
}

export function IoHubScreen({
  showToast,
}: {
  showToast: (toast: ToastState) => void;
}) {
  const operator = useCurrentOperator();
  const showApprovals = isWarehouseStaff(operator);
  const [tab, setTab] = useState<IoHubTab>("compose");

  const tabs: TabSpec[] = [
    { id: "compose", label: "작성" },
    { id: "drafts", label: "이어쓰기" },
    { id: "myRequests", label: "내 요청" },
    ...(showApprovals ? [{ id: "approvals" as const, label: "승인함" }] : []),
  ];

  return (
    <div className="flex flex-col">
      <div
        className="sticky top-0 z-10 flex gap-1 border-b px-3 pt-2 pb-2"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex-1 rounded-[10px] px-2 py-[7px] font-bold transition-[background-color]",
                TYPO.caption,
              )}
              style={{
                background: active ? (LEGACY_COLORS.s2 as string) : "transparent",
                color: active
                  ? (LEGACY_COLORS.blue as string)
                  : (LEGACY_COLORS.muted2 as string),
              }}
              aria-current={active ? "page" : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "compose" ? <WarehouseWizardScreen showToast={showToast} /> : null}
      {tab === "drafts" ? <DraftsListPanel showToast={showToast} /> : null}
      {tab === "myRequests" ? <MyRequestsPanel /> : null}
      {tab === "approvals" && showApprovals ? (
        <ApprovalQueuePanel showToast={showToast} />
      ) : null}
    </div>
  );
}
