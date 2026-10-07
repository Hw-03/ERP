"use client";

import type { Operator } from "../../login/useCurrentOperator";
import { useState } from "react";
import { DailyWorkReportScreen } from "../../_daily_report/DailyWorkReportScreen";
import layoutStyles from "../../_daily_report/dailyMobileLayout.module.css";
import { MobilePageHeader } from "../primitives/MobilePageHeader";

export function MobileDailyWorkReportScreen({
  operator,
  flushSaveRef,
  onExit,
}: {
  operator: Operator | null;
  flushSaveRef: React.MutableRefObject<(() => Promise<void>) | null>;
  onExit?: () => void;
}) {
  const [scrollMode, setScrollMode] = useState(false);
  return <div className="flex min-h-0 flex-1 flex-col">
    <MobilePageHeader className="mx-3 mb-3" title="일일 작업 일보" onBack={onExit} backLabel="더보기 메뉴로 돌아가기" />
    <div className={`mx-3 ${layoutStyles.viewport} ${scrollMode ? layoutStyles.scrollable : ""}`} data-testid="daily-work-report-viewport" data-scroll-mode={scrollMode ? "scroll" : "fit"}>
      <DailyWorkReportScreen employeeId={operator?.employee_id} operator={operator} saveRef={flushSaveRef} onMobileScrollModeChange={setScrollMode} mobile />
    </div>
  </div>;
}
