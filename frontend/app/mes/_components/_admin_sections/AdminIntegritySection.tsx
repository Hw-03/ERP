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
          <span>· 발견 문제 {result.issue_count}건</span>
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
          {result.issues.length === 0 ? <p className="admin-integrity-empty">
            발견된 정합성 문제가 없습니다.
          </p> : <ul>
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
