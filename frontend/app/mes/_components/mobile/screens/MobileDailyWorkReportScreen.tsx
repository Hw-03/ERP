"use client";

import type { Operator } from "../../login/useCurrentOperator";
import { DailyWorkReportScreen } from "../../_daily_report/DailyWorkReportScreen";
import { MobilePageHeader } from "../primitives/MobilePageHeader";
import { MobileScrollFrame } from "../primitives/MobileScrollFrame";

export function MobileDailyWorkReportScreen({
  operator,
  flushSaveRef,
  onExit,
}: {
  operator: Operator | null;
  onExit?: () => void;
  flushSaveRef: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  return <div className="flex min-h-0 flex-1 flex-col">
    <MobilePageHeader className="mx-3 mb-3" title="일일 작업 일보" onBack={onExit} backLabel="더보기 메뉴로 돌아가기" />
    <MobileScrollFrame><DailyWorkReportScreen employeeId={operator?.employee_id} operator={operator} saveRef={flushSaveRef} mobile /></MobileScrollFrame>
  </div>;
}
