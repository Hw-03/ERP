"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CircleCheck, ClipboardCheck, RefreshCw, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import { adminApi, type InventoryIntegrityCategory, type InventoryIntegrityResult } from "@/lib/api/admin";
import { Button } from "@/lib/ui/Button";
import { INTEGRITY_CHECK_LABELS, integrityDisplayIssues } from "./integrityDisplay";
import { AdminPageHeader } from "./_admin_primitives/AdminPageHeader";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { useAdminReadReveal } from "./useAdminReadReveal";

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
  const displayIssues = result ? integrityDisplayIssues(result) : [];
  const blockingCount = result?.blocking_count ?? result?.issue_count ?? 0;
  const warningCount = result?.warning_count ?? 0;
  const issueCount = blockingCount + warningCount;
  const initialLoading = loading && !result;
  const checks = result?.checks?.length ? result.checks.map((check) => ({
    key: check.check_id, label: INTEGRITY_CHECK_LABELS[check.check_id] ?? check.check_id, count: check.count,
  })) : (Object.keys(CATEGORY_LABELS) as InventoryIntegrityCategory[]).map((category) => ({
    key: category, label: CATEGORY_LABELS[category], count: result?.category_counts[category] ?? 0,
  }));
  const revealRef = useAdminReadReveal<HTMLElement>(initialLoading, !!error);

  return (
    <>
    {initialLoading && <p role="status" className="sr-only">정합성 검사 결과를 불러오는 중입니다.</p>}
    <section ref={revealRef} className="admin-integrity" aria-label="정합성 검사" aria-busy={loading}>
      <div className="admin-integrity-header">
        <div className="admin-integrity-intro">
          <AdminPageHeader icon={ShieldCheck} title="정합성" />
        </div>
        {(result || initialLoading) && <dl className="admin-integrity-summary">
          <div className={result ? "admin-integrity-status" : undefined} data-alert={result ? issueCount > 0 : undefined}>
            <dt><ShieldCheck size={20} aria-hidden="true" />검사 결과</dt>
            <dd className={initialLoading ? "flex h-[1.1em] items-center" : undefined}>{initialLoading ? <SkeletonBlock className="h-5 w-20" /> : issueCount === 0 ? "정상" : "확인 필요"}</dd>
          </div>
          <div data-alert={result ? issueCount > 0 : undefined}>
            <dt><TriangleAlert size={20} aria-hidden="true" />발견 문제</dt>
            <dd aria-label={result ? `발견 문제 ${issueCount}건` : undefined} className={initialLoading ? "flex h-[1.1em] items-center" : undefined}>{initialLoading ? <SkeletonBlock className="h-5 w-16" /> : <>{issueCount}<span>건</span></>}</dd>
          </div>
          <div>
            <dt><Wrench size={20} aria-hidden="true" />CLI 복구 가능</dt>
            <dd className={initialLoading ? "flex h-[1.1em] items-center" : undefined}>{initialLoading ? <SkeletonBlock className="h-5 w-16" /> : <>{repairableCount}<span>건</span></>}</dd>
          </div>
        </dl>}
        <Button variant="secondary" size="md" className="min-h-11 admin-integrity-recheck" iconLeft={<RefreshCw />} loading={loading} onClick={() => void load()}>
          다시 검사
        </Button>
      </div>

      {error && <p role="alert" className="admin-integrity-error">{error}</p>}
      {result && <p className="admin-integrity-description">차단 {blockingCount}건 · 경고 {warningCount}건</p>}

      {(result || initialLoading) && <>
        <div className="admin-integrity-checks">
          <div className="admin-integrity-checks-heading">
            <h3><ClipboardCheck size={16} aria-hidden="true" />항목별 검사</h3>
            <p className="admin-integrity-description">재고·불량·취소·연결 업무·주간보고를 읽기 전용으로 검사합니다.</p>
            <p className="admin-integrity-timestamp">검사 시각 {result ? <time dateTime={result.generated_at}>{new Date(result.generated_at).toLocaleString("ko-KR")}</time> : <SkeletonBlock className="h-3 w-40 align-middle" />}</p>
          </div>
          <div className="admin-integrity-categories">
          {checks.map((check) => <div
            key={check.key}
            data-alert={check.count > 0}
          >
            {initialLoading ? <SkeletonBlock className="h-4 w-4 shrink-0" /> : check.count ? <TriangleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
            <span>{check.label}</span>
            <strong>{initialLoading ? <SkeletonBlock className="h-4 w-8 align-middle" /> : <>{check.count}<small>건</small></>}</strong>
          </div>)}
          </div>
        </div>

        <div className="admin-integrity-results">
          {(result?.checks ?? []).filter((check) => check.count > check.samples.length && !result?.issues.some((issue) => issue.category === check.check_id)).map((check) => <p key={check.check_id}>
            {INTEGRITY_CHECK_LABELS[check.check_id] ?? check.check_id}: 검출 {check.count}건 중 상세 표본 {check.samples.length}건을 표시합니다. 전체 상세는 제공되지 않았습니다.
          </p>)}
          {initialLoading ? <div aria-hidden="true" className="flex flex-col gap-4">
            {[0, 1, 2].map((row) => <div key={row} className="flex flex-col gap-3 rounded-xl border border-[var(--c-border)] p-4">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-5 w-1/3" />
              <SkeletonBlock className="h-4 w-3/4" />
            </div>)}
          </div> : issueCount === 0 ? <div className="admin-integrity-empty">
            <Image src="/images/dexray/weekly-empty.webp" alt="" width={840} height={560} sizes="300px" className="admin-integrity-mascot" />
            <span className="admin-integrity-empty-badge"><CircleCheck size={16} aria-hidden="true" />검사 완료</span>
            <h3>발견된 정합성 문제가 없습니다.</h3>
            <p>검사한 항목이 모두 정상입니다.</p>
          </div> : <ul>
            {displayIssues.map((issue) => <li key={issue.problem_id}>
              <div className="admin-integrity-issue-meta">
                <span>{INTEGRITY_CHECK_LABELS[issue.category] ?? issue.category}</span>
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
    </>
  );
}
