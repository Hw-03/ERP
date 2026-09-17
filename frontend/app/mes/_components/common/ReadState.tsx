"use client";

import { LoadingSkeleton } from "./LoadingSkeleton";
import { LoadFailureCard } from "./LoadFailureCard";
import { EmptyState } from "./EmptyState";

/** 업무별 레이아웃은 유지하면서 조회 상태의 안내와 복구 동작만 공유한다. */
export function ReadLoading({ label = "데이터를 불러오고 있습니다…", variant = "list" }: {
  label?: string; variant?: "list" | "table" | "card";
}) {
  return <div role="status" aria-busy="true" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true"><LoadingSkeleton variant={variant} /></div>
  </div>;
}

export function ReadFailure({ message, onRetry, refresh = false }: {
  message: string; onRetry: () => void; refresh?: boolean;
}) {
  return <LoadFailureCard message={message} onRetry={onRetry} retryLabel="다시 시도" comfortable
    prefix={refresh ? "최신 정보를 불러오지 못했습니다. 기존 내용을 표시합니다" : "데이터를 불러오지 못했습니다"} />;
}

export function ReadEmpty({ hasSearch = false, hasFilters = false, onReset, title, description }: {
  hasSearch?: boolean; hasFilters?: boolean; onReset?: () => void; title?: string; description?: string;
}) {
  const variant = hasSearch ? "no-search-result" : hasFilters ? "filtered-out" : "no-data";
  return <EmptyState comfortable variant={variant} title={title}
    description={description ?? (hasSearch ? "검색어를 바꾸거나 지워서 다시 확인하세요." : hasFilters ? "필터를 초기화해 다시 확인하세요." : "아직 표시할 내역이 없습니다.")}
    action={onReset && (hasSearch || hasFilters) ? { label: hasFilters ? "필터 초기화" : "검색 지우기", onClick: onReset } : undefined} />;
}
