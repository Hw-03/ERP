"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  api,
  type StockRequest,
  type StockRequestStatus,
  type StockRequestType,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatDateTime, formatQty } from "@/lib/mes/format";
import { useCurrentOperator } from "../../../login/useCurrentOperator";
import { TYPO } from "../../tokens";
import { AsyncState, EmptyState, FilterChip, SectionCard } from "../../primitives";

const STATUS_FILTERS: { id: "all" | StockRequestStatus; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "submitted", label: "대기" },
  { id: "reserved", label: "예약" },
  { id: "completed", label: "완료" },
  { id: "rejected", label: "반려" },
  { id: "cancelled", label: "취소" },
];

const STATUS_LABEL: Record<StockRequestStatus, string> = {
  draft: "초안",
  submitted: "대기",
  reserved: "예약",
  rejected: "반려",
  cancelled: "취소",
  completed: "완료",
  failed_approval: "승인 실패",
};

const STATUS_TONE: Record<StockRequestStatus, string> = {
  draft: LEGACY_COLORS.muted2 as string,
  submitted: LEGACY_COLORS.yellow as string,
  reserved: LEGACY_COLORS.blue as string,
  rejected: LEGACY_COLORS.red as string,
  cancelled: LEGACY_COLORS.muted as string,
  completed: LEGACY_COLORS.green as string,
  failed_approval: LEGACY_COLORS.red as string,
};

const TYPE_LABEL: Record<StockRequestType, string> = {
  raw_receive: "공급업체 입고",
  raw_ship: "공급업체 출고",
  warehouse_to_dept: "창고→부서",
  dept_to_warehouse: "부서→창고",
  dept_internal: "부서 내 조정",
  mark_defective_wh: "불량 격리(창고)",
  mark_defective_prod: "불량 격리(부서)",
  supplier_return: "공급업체 반품",
  package_out: "패키지 출하",
  manual_adjustment: "낱개 조정",
};

export function MyRequestsPanel() {
  const operator = useCurrentOperator();
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>("all");

  const load = async () => {
    if (!operator) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listMyStockRequests(operator.employee_id);
      setRequests(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator?.employee_id]);

  const filtered =
    filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          />
        ))}
      </div>

      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && filtered.length === 0}
        emptyView={
          <EmptyState
            icon={ClipboardList}
            title={
              filter === "all" ? "제출한 요청이 없습니다" : "해당 상태의 요청이 없습니다"
            }
          />
        }
        onRetry={load}
      >
        <div className="flex flex-col gap-2">
          {filtered.map((req) => (
            <RequestCard key={req.request_id} req={req} />
          ))}
        </div>
      </AsyncState>
    </div>
  );
}

function RequestCard({ req }: { req: StockRequest }) {
  const tone = STATUS_TONE[req.status];
  const totalQty = req.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  return (
    <SectionCard padding="md">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`${TYPO.caption} rounded-full px-2 py-[2px] font-bold`}
              style={{ background: `${tone}22`, color: tone }}
            >
              {STATUS_LABEL[req.status]}
            </span>
            <span
              className={`${TYPO.caption} font-semibold`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {TYPE_LABEL[req.request_type] ?? req.request_type}
            </span>
          </div>
          <div
            className={`${TYPO.body} mt-1 truncate font-black`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {req.request_code ?? req.request_id.slice(0, 8)}
          </div>
          <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
            {formatDateTime(req.submitted_at ?? req.created_at)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`${TYPO.body} font-black tabular-nums`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {formatQty(totalQty)}
          </div>
          <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
            {req.lines.length}품목
          </div>
        </div>
      </div>
      {req.rejected_reason ? (
        <div
          className={`${TYPO.caption} mt-2 rounded-[10px] px-3 py-2`}
          style={{
            background: `${LEGACY_COLORS.red as string}14`,
            color: LEGACY_COLORS.red as string,
          }}
        >
          반려: {req.rejected_reason}
        </div>
      ) : null}
    </SectionCard>
  );
}
