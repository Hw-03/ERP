"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, type InventoryIntegrityCategory, type InventoryIntegrityResult } from "@/lib/api/admin";
import { Button } from "@/lib/ui/Button";

const CATEGORY_LABELS: Record<InventoryIntegrityCategory, string> = {
  DEFECT_STOCK_MISMATCH: "불량 원장·재고",
  PARTIAL_CANCELLATION: "부분 취소 의심",
  WORKFLOW_STATE_RESIDUE: "업무 상태 잔존",
  SHIPPING_ALLOCATION_MISMATCH: "출하 배정",
  DUPLICATE_REVERSAL: "중복 역전",
  WEEKLY_UNCLASSIFIED_EFFECT: "주간 미분류",
};

const CHECK_LABELS: Record<string, string> = {
  INVENTORY_TOTAL_MISMATCH: "재고 총량 불일치",
  NEGATIVE_INVENTORY: "음수 재고",
  NEGATIVE_LOCATION: "음수 위치 재고",
  PENDING_RESERVATION_MISMATCH: "예약 수량 불일치",
  STOCK_REQUEST_STATE_MISMATCH: "재고 요청 상태 불일치",
  SHIPPING_ALLOCATION_MISMATCH: "출하 배정 불일치",
  WAREHOUSE_PHYSICAL_MISMATCH: "창고 물리 원장 불일치",
  ORPHAN_REFERENCE: "고아 참조",
  OPERATION_V2_EFFECT_INVALID: "v2 재고 효과 손상",
  OPERATION_V1_EFFECT_MISSING: "레거시 재고 효과 경고",
};

export function AdminIntegritySection() {
  const [result, setResult] = useState<InventoryIntegrityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setResult(await adminApi.getInventoryIntegrity());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "정합성 검사에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const repairableCount = result?.issues.filter((issue) => issue.repairable).length ?? 0;
  const findingCount = (result?.blocking_count ?? 0) + (result?.warning_count ?? 0);
  const contractOnlyChecks = result?.checks.flatMap((check) => {
    const hasLegacyCategory = Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, check.check_id);
    const legacyCount = hasLegacyCategory
      ? result.category_counts[check.check_id as InventoryIntegrityCategory]
      : 0;
    const count = Math.max(0, check.count - legacyCount);
    if (count === 0) return [];
    return [{
      ...check,
      count,
      samples: check.samples.filter((sample) => !("problem_id" in sample)),
    }];
  }) ?? [];

  return (
    <section className="admin-integrity">
      <header>
        <div>
          <h2>정합성</h2>
          <p>재고·불량·취소·연결 업무·주간보고를 읽기 전용으로 검사합니다.</p>
        </div>
        <Button variant="secondary" size="sm" loading={loading} onClick={() => void load()}>
          다시 검사
        </Button>
      </header>

      {error && <p role="alert" className="admin-integrity-error">{error}</p>}

      {result && <>
        <div className="admin-integrity-summary">
          <span>검사 결과: {result.is_consistent ? "정상" : "확인 필요"}</span>
          <span>· 발견 문제 {findingCount}건</span>
          <span>· <b>CLI 복구 가능</b> {repairableCount}건</span>
          <span>· {new Date(result.generated_at).toLocaleString("ko-KR")}</span>
        </div>

        <div className="admin-integrity-categories">
          {(Object.keys(CATEGORY_LABELS) as InventoryIntegrityCategory[]).map((category) => <span
            key={category}
            data-alert={Boolean(result.category_counts[category])}
          >
            {CATEGORY_LABELS[category]} {result.category_counts[category]}
          </span>)}
        </div>

        <div className="admin-integrity-results">
          {result.issues.length === 0 && contractOnlyChecks.length === 0 ? <p className="admin-integrity-empty">
            발견된 정합성 문제가 없습니다.
          </p> : <ul>
            {contractOnlyChecks.map((check) => <li key={`contract-${check.check_id}`}>
              <div className="admin-integrity-issue-meta">
                <span>{CHECK_LABELS[check.check_id] ?? "정합성 계약"}</span>
                <span>{check.check_id}</span>
                <span data-repairable={check.severity === "warning"}>
                  {check.severity === "warning" ? "경고" : "차단"} · {check.count}건
                </span>
              </div>
              <p>CLI·관리자 API·상세 헬스에 공통 적용되는 검사입니다.</p>
              {check.samples.length > 0 && <small>
                샘플: {check.samples.map((sample) => JSON.stringify(sample)).join(" · ")}
              </small>}
            </li>)}
            {result.issues.map((issue) => <li key={issue.problem_id}>
              <div className="admin-integrity-issue-meta">
                <span>{CATEGORY_LABELS[issue.category]}</span>
                <span>{issue.problem_id}</span>
                <span data-repairable={issue.repairable}>
                  {issue.repairable ? "CLI 복구 가능" : "수동 검토 필요"}
                </span>
              </div>
              <h3>{issue.title}</h3>
              <p>{issue.description}</p>
              <dl>
                <div><dt className="font-black">현재값</dt><dd>{issue.current_value}</dd></div>
                <div><dt className="font-black">기대 복구값</dt><dd>{issue.expected_value}</dd></div>
              </dl>
              <small>원인 ID: {issue.cause_ids.join(" · ")}</small>
            </li>)}
          </ul>}
        </div>
      </>}
    </section>
  );
}
