# 공통 모듈 설계 — 2026-05-02

> **작업 ID:** MES-COMP-002~005  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (설계 문서만, 실제 생성은 회사 PC)

---

## MES-COMP-002 — StatusPill / StatusBadge 통합 설계

### 현재 두 컴포넌트 비교

| 항목 | `common/StatusPill.tsx` | `mobile/primitives/StatusBadge.tsx` |
|---|---|---|
| Tone 타입 | `"info" \| "success" \| "warning" \| "danger" \| "neutral"` | `"ok" \| "warn" \| "danger" \| "info" \| "muted"` |
| 공통 | `info`, `danger` | `info`, `danger` |
| 차이 | `success`, `warning`, `neutral` | `ok`, `warn`, `muted` |
| 스타일 | Tailwind 클래스 내부 | Tailwind 클래스 내부 |
| 사용처 | 데스크톱 전반 | 모바일 전반 |

### Tone 통합 매핑

```ts
// 통합 타입 (mes-status.ts)
export type MesTone = "info" | "success" | "warning" | "danger" | "neutral" | "muted";

// 구버전 → 통합 매핑
const STATUSBADGE_MAP: Record<string, MesTone> = {
  ok:   "success",   // ok → success
  warn: "warning",   // warn → warning
  muted: "muted",    // muted → muted (신규 추가)
};
const STATUSPILL_MAP: Record<string, MesTone> = {
  success: "success",
  warning: "warning",
  neutral: "neutral",
};
// info, danger는 양쪽 동일
```

### 권장 신규 파일: `frontend/lib/mes-status.ts`

```ts
export type MesTone = "info" | "success" | "warning" | "danger" | "neutral" | "muted";

export const TONE_STYLES: Record<MesTone, { bg: string; text: string; dot?: string }> = {
  info:    { bg: "bg-blue-50",   text: "text-blue-700" },
  success: { bg: "bg-green-50",  text: "text-green-700" },
  warning: { bg: "bg-yellow-50", text: "text-yellow-700" },
  danger:  { bg: "bg-red-50",    text: "text-red-700" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600" },
  muted:   { bg: "bg-slate-50",  text: "text-slate-400" },
};

// 상태 문자열 → MesTone 자동 추론
export function inferTone(status: string | null | undefined): MesTone {
  if (!status) return "neutral";
  const s = status.toUpperCase();
  if (["COMPLETED", "OK", "ACTIVE", "SUCCESS"].includes(s)) return "success";
  if (["CANCELLED", "ERROR", "DANGER", "FAILED"].includes(s)) return "danger";
  if (["WARNING", "PENDING", "DRAFT"].includes(s)) return "warning";
  if (["RESERVED", "SUBMITTED", "INFO"].includes(s)) return "info";
  return "neutral";
}
```

### 마이그레이션 절차

1. `frontend/lib/mes-status.ts` 신규 생성
2. `common/StatusPill.tsx` → `MesTone` import, 내부 TONE_COLOR를 `TONE_STYLES`로 교체
3. `mobile/primitives/StatusBadge.tsx` → `MesTone` import, ok/warn 매핑 추가
4. 점진적 마이그레이션 (기존 prop 타입 alias 유지)

---

## MES-COMP-003 — 모달·바텀시트·Toast 산재 매핑

### 현재 위치

| UI 요소 | 파일 | 사용처 |
|---|---|---|
| Toast | `_components/Toast.tsx` | 입출고 완료 후 |
| ConfirmModal | `common/ConfirmModal.tsx` (추정) | 위험 작업 확인 |
| BottomSheet | `_components/BottomSheet.tsx` | 데스크톱+모바일 |
| AlertDialog | shadcn/ui 추정 | 관리자 삭제 |
| 바텀시트 (모바일) | `mobile/primitives/SheetHeader.tsx` | 모바일 전용 |

### 문제: Toast 산재 추정 위치

```bash
# 확인 명령 (회사 PC에서)
rg -n "Toast\|toast\|setMessage\|showToast" frontend/app/legacy/_components/ --glob "!_archive"
```

### 통합 설계안

```ts
// frontend/lib/mes-toast.ts (계획)
export function showToast(message: string, tone: MesTone = "info", duration = 3000) { ... }
export function showSuccessToast(message: string) { ... }
export function showErrorToast(message: string) { ... }
```

단일 Toast 컴포넌트로 통일, `setMessage` props drilling 제거.

---

## MES-COMP-004 — 거래 타입 라벨/색상 단일화

### 현재 위치

`legacyUi.ts::transactionLabel()` — 11개 거래 타입 한국어 라벨 정의.

```ts
// 현재 legacyUi.ts (단일 소스, 양호)
export function transactionLabel(type: string): string {
  const labels: Record<string, string> = {
    RECEIVE: "입고", SHIP: "출고", ADJUSTMENT: "조정",
    PRODUCE: "생산소비", SCRAP: "폐기", LOSS: "분실",
    RETURN: "반품", TRANSFER: "이동", RESERVE: "예약",
    CANCEL: "취소", DEPT_TRANSFER: "부서이동",
  };
  return labels[type] ?? type;
}
```

### 색상 확장 필요

현재 `transactionLabel`에 색상 없음. `PROCESS_TYPE_META` 방식처럼 색상 포함 객체로 확장 권장.

```ts
// 확장안 (mes-status.ts 또는 legacyUi.ts 확장)
export const TRANSACTION_META: Record<string, { label: string; tone: MesTone }> = {
  RECEIVE:       { label: "입고",     tone: "success" },
  SHIP:          { label: "출고",     tone: "info" },
  ADJUSTMENT:    { label: "조정",     tone: "warning" },
  PRODUCE:       { label: "생산소비", tone: "info" },
  SCRAP:         { label: "폐기",     tone: "danger" },
  LOSS:          { label: "분실",     tone: "danger" },
  RETURN:        { label: "반품",     tone: "neutral" },
  TRANSFER:      { label: "이동",     tone: "info" },
  RESERVE:       { label: "예약",     tone: "warning" },
  CANCEL:        { label: "취소",     tone: "muted" },
  DEPT_TRANSFER: { label: "부서이동", tone: "info" },
};
```

**위험도:** A (신규 상수 추가만, 기존 코드 변경 없음)

---

## MES-COMP-005 — 날짜·숫자 포맷 통합

### 현재 산재 패턴

```bash
# 확인 명령
rg -n "toLocaleString\|toLocaleDateString\|format.*date\|parseUtc\|formatDate\|Intl\." frontend/ --glob "*.ts" --glob "*.tsx"
```

### 권장 파일: `frontend/lib/mes-format.ts` (신규)

```ts
// 50~60대 가독성 기준

// 날짜
export function fmtDate(iso: string | Date): string {
  // "2026년 5월 1일"
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
}

export function fmtDateTime(iso: string | Date): string {
  // "2026년 5월 1일 오전 9:30"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtRelative(iso: string | Date): string {
  // "3시간 전" (6시간 이내), 이후 fmtDate
  const diff = Date.now() - new Date(iso).getTime();
  const hours = diff / 3600000;
  if (hours < 1) return `${Math.floor(diff / 60000)}분 전`;
  if (hours < 6) return `${Math.floor(hours)}시간 전`;
  return fmtDate(iso);
}

// 숫자
export function fmtQty(n: number): string {
  // "1,234개"
  return `${n.toLocaleString("ko-KR")}개`;
}

export function fmtNumber(n: number): string {
  // "1,234"
  return n.toLocaleString("ko-KR");
}
```

### 기존 `formatNumber` 함수 위치

`legacyUi.ts` 내 `formatNumber` 이미 존재 — `mes-format.ts`로 이전 후 re-export로 하위 호환 유지.

**위험도:** A (신규 파일만, 기존 코드 변경 없음)

---

## 권장 공통 모듈 최종 구조

```
frontend/lib/
├── api.ts              (기존 유지)
├── mes-department.ts   (부서 색상/라벨 — MES-COMP-001, 회사 PC)
├── mes-status.ts       (StatusTone 통합 — MES-COMP-002, 회사 PC)
├── mes-format.ts       (날짜/숫자 — MES-COMP-005, 모바일 가능)
└── mes-toast.ts        (Toast 통합 — MES-COMP-003, 회사 PC)
```

`TRANSACTION_META` 확장 (MES-COMP-004)은 `legacyUi.ts` 직접 확장 or `mes-status.ts` 포함.
