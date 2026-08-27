# 관리자 내보내기 단일 카드 통합 구현 계획

> **추천 모델: GPT-5.6 Terra** - 비동기 조회 시점과 모드 상태를 함께 다루는 중간 규모 프런트엔드 변경이다.
> **추천 추론 수준: 높음** - 기존 다운로드 회귀 없이 카드 구조·지연 조회·접근성을 함께 검증해야 한다.
> **추천 실행 방식: 솔로 순차 실행** - 핵심 컴포넌트와 통합 테스트가 밀접하게 연결되어 병렬 편집 이점이 없다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 관리자 내보내기 화면의 일반 데이터와 내부 원본 로그를 단일 데이터 내보내기 카드의 두 모드로 통합하고 기존 다운로드 동작을 보존한다.

**Goal:** F704-02·F705-02 공식 서식은 유지하면서 범용 데이터와 월별 원본 로그를 한 카드에서 필요할 때 전환해 내려받도록 만든다.

**Architecture:** `AdminExportSection`이 단일 카드와 `general | audit` 모드를 소유한다. 원본 로그 조회와 다운로드는 조건부로 마운트되는 `AdminAuditCsvControls`에 격리해 일반 모드에서는 목록 API를 호출하지 않는다. 백엔드 API와 DB는 변경하지 않는다.

**Tech Stack:** Next.js 14, React 18, TypeScript, TanStack Query, Testing Library, Vitest, Tailwind CSS

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** — 카드 통합과 비동기 상태 변경을 기존 프런트엔드 패턴에 맞춰 구현하는 작업이다.

**추천 추론 수준: 높음** — 일반 데이터 상태 보존, 원본 로그 지연 조회, 다운로드 오류 처리를 함께 검증해야 한다.

**팀 구성: 불필요** — 테스트와 두 컴포넌트가 순차 의존하며 같은 파일 경계를 함께 수정한다.

**커밋:** 프로젝트 규칙상 사용자 요청 전에는 생성하지 않는다.

---

### Task 1: 월별 원본 로그 제어 컴포넌트 `GPT-5.6 Terra` `순차`

**Files:**
- Create: `frontend/app/mes/_components/_admin_sections/AdminAuditCsvControls.tsx`
- Delete: `frontend/app/mes/_components/_admin_sections/AdminAuditCsvSection.tsx`
- Create: `frontend/app/mes/_components/_admin_sections/__tests__/AdminAuditCsvControls.test.tsx`
- Delete: `frontend/app/mes/_components/_admin_sections/__tests__/AdminAuditCsvSection.test.tsx`
- Modify: `frontend/app/mes/_components/common/FilterChip.tsx`

- [x] **Step 1: 최신 월·형식·단일 다운로드 동작을 고정하는 실패 테스트 작성**

```tsx
import { AdminAuditCsvSection as AdminAuditCsvControls } from "../AdminAuditCsvSection";

it("최신 월을 기본 선택하고 선택한 월·형식으로 한 번만 다운로드한다", async () => {
  state.queryResult.data = [
    { month: "2026-05", file_name: "inout_2026-05.csv", row_count: 2, size_bytes: 128 },
    { month: "2026-07", file_name: "inout_2026-07.csv", row_count: 3, size_bytes: 256 },
  ];
  render(<AdminAuditCsvControls />);

  expect(screen.getByRole("combobox", { name: "대상 월" })).toHaveTextContent("2026년 7월");
  expect(screen.getByRole("button", { name: "CSV" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("combobox", { name: "대상 월" }));
  fireEvent.mouseDown(screen.getByRole("option", { name: "2026년 5월" }));
  fireEvent.click(screen.getByRole("button", { name: "Excel" }));
  fireEvent.click(screen.getByRole("button", { name: "2026년 5월 Excel 다운로드" }));

  await waitFor(() => expect(state.downloadAuditFile).toHaveBeenCalledWith("2026-05", "xlsx"));
  expect(state.downloadAuditFile).toHaveBeenCalledOnce();
});
```

```tsx
it("파일이 없으면 빈 상태를 표시하고 다운로드를 막는다", () => {
  state.queryResult.data = [];
  render(<AdminAuditCsvControls />);

  expect(screen.getByText("아직 누적된 파일이 없습니다")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /다운로드/ })).not.toBeInTheDocument();
});

it("목록과 다운로드 오류를 같은 제어 영역에 표시한다", async () => {
  state.queryResult.error = new Error("목록 조회 실패");
  const { rerender } = render(<AdminAuditCsvControls />);
  expect(screen.getByRole("alert")).toHaveTextContent("목록 조회 실패");

  state.queryResult.error = null;
  state.queryResult.data = [
    { month: "2026-07", file_name: "inout_2026-07.csv", row_count: 3, size_bytes: 256 },
  ];
  state.downloadAuditFile.mockRejectedValue(new Error("다운로드 실패"));
  rerender(<AdminAuditCsvControls />);
  fireEvent.click(screen.getByRole("button", { name: "2026년 7월 CSV 다운로드" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("다운로드 실패");
});

it("브라우저 다운로드 실패에도 객체 URL과 앵커를 정리한다", async () => {
  const revokeObjectURL = vi.fn();
  const removeChild = vi.spyOn(document.body, "removeChild");
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:audit"), revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    throw new Error("브라우저 다운로드 실패");
  });
  state.downloadAuditFile.mockResolvedValue(new Blob(["csv"]));
  render(<AdminAuditCsvControls />);

  fireEvent.click(screen.getByRole("button", { name: "2026년 7월 CSV 다운로드" }));

  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit"));
  expect(removeChild).toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent("브라우저 다운로드 실패");
});
```

- [x] **Step 2: 새 테스트가 현재 구조에서 실패하는지 확인**

Run: `cd frontend && npx vitest run app/mes/_components/_admin_sections/__tests__/AdminAuditCsvSection.test.tsx`

Expected: FAIL — 기존 월별 표에는 `대상 월` combobox와 선택형 단일 다운로드 버튼이 없다.

- [x] **Step 3: 선택 상태를 전달하는 FilterChip 접근성 속성 추가**

```tsx
<Button
  aria-pressed={active}
  variant={active ? "ghost" : "secondary"}
  onClick={onClick}
  className={`whitespace-nowrap rounded-full ${px} text-sm ${className}`}
  style={{
    background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
    borderColor: active ? tone : LEGACY_COLORS.border,
    color: active ? tone : LEGACY_COLORS.muted2,
  }}
>
  {label}
</Button>
```

- [x] **Step 4: 독립 카드 대신 조건부 본문용 제어 컴포넌트 구현**

```tsx
type AuditFormat = "csv" | "xlsx";

const monthOptions = [...files]
  .sort((left, right) => right.month.localeCompare(left.month))
  .map((file) => ({ value: file.month, label: formatMonthLabel(file.month) }));
const effectiveMonth = monthOptions.some((option) => option.value === selectedMonth)
  ? selectedMonth
  : monthOptions[0]?.value ?? "";

<div data-testid="audit-csv-controls" className="flex min-h-0 flex-1 flex-col">
  <div className="grid gap-4 md:grid-cols-2">
    <div>
      <div className="mb-1.5 text-[12px] font-bold">대상 월</div>
      <AppSelect
        value={effectiveMonth}
        onChange={setSelectedMonth}
        options={monthOptions}
        triggerAriaLabel="대상 월"
      />
    </div>
    <div role="group" aria-label="원본 로그 파일 형식">
      <div className="mb-1.5 text-[12px] font-bold">파일 형식</div>
      <div className="flex gap-1.5">
        <FilterChip active={format === "csv"} label="CSV" onClick={() => setFormat("csv")} />
        <FilterChip active={format === "xlsx"} label="Excel" onClick={() => setFormat("xlsx")} />
      </div>
    </div>
  </div>
  <Button
    loading={downloading}
    disabled={!effectiveMonth}
    onClick={() => void handleDownload(effectiveMonth, format)}
    className="mt-auto min-h-11 w-full"
  >
    {`${formatMonthLabel(effectiveMonth)} ${format === "xlsx" ? "Excel" : "CSV"} 다운로드`}
  </Button>
</div>
```

목록 로딩은 `status`, 목록·다운로드 실패는 `alert`, 성공은 `status`, 빈 목록은 기존 `EmptyState`로 반환한다. `downloadBlob`의 `finally`에서 앵커 제거와 `URL.revokeObjectURL`을 보장한다.

구현 후 컴포넌트 파일과 테스트 파일을 각각 `AdminAuditCsvControls.tsx`, `AdminAuditCsvControls.test.tsx`로 완전히 이름 바꾸고 테스트 import를 다음처럼 갱신한다.

```tsx
import { AdminAuditCsvControls } from "../AdminAuditCsvControls";
```

- [x] **Step 5: 제어 컴포넌트 테스트 통과 확인**

Run: `cd frontend && npx vitest run app/mes/_components/_admin_sections/__tests__/AdminAuditCsvControls.test.tsx`

Expected: PASS — 최신 월 기본값, 월·형식 변경, 단일 다운로드, 빈 목록과 오류, 객체 URL 정리가 모두 통과한다.

### Task 2: 단일 데이터 카드와 두 모드 통합 `GPT-5.6 Terra` `순차`

**Files:**
- Modify: `frontend/app/mes/_components/_admin_sections/AdminExportSection.tsx`
- Modify: `frontend/app/mes/_components/_admin_sections/__tests__/AdminExportSection.test.tsx`

- [x] **Step 1: 최상위 카드 3개와 지연 조회를 고정하는 실패 테스트 작성**

```tsx
it("데이터와 원본 로그를 한 카드의 두 모드로 전환한다", () => {
  render(<AdminExportSection />);
  const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });
  const modeGroup = within(dataExport).getByRole("group", { name: "내보내기 유형" });

  expect(screen.getAllByRole("region")).toHaveLength(3);
  expect(screen.queryByRole("region", { name: "내부 원본 로그 (월별)" })).not.toBeInTheDocument();
  expect(within(modeGroup).getByRole("button", { name: "일반 데이터" })).toHaveAttribute("aria-pressed", "true");
  expect(state.useAuditCsvListQuery).not.toHaveBeenCalled();

  fireEvent.click(within(modeGroup).getByRole("button", { name: "내부 원본 로그" }));

  expect(within(dataExport).getByTestId("audit-csv-controls")).toBeInTheDocument();
  expect(state.useAuditCsvListQuery).toHaveBeenCalledOnce();
});
```

```tsx
it("모드 전환 후에도 일반 데이터 선택 상태를 보존한다", () => {
  render(<AdminExportSection />);
  const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

  fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
  fireEvent.click(within(dataExport).getByRole("button", { name: "Excel" }));
  fireEvent.click(within(dataExport).getByRole("button", { name: "내부 원본 로그" }));
  fireEvent.click(within(dataExport).getByRole("button", { name: "일반 데이터" }));

  expect(within(dataExport).getByRole("button", { name: "품목 Excel 다운로드" })).toBeEnabled();
  expect(within(dataExport).getByRole("button", { name: "품목" })).toHaveAttribute("aria-pressed", "true");
  expect(within(dataExport).getByRole("button", { name: "Excel" })).toHaveAttribute("aria-pressed", "true");
});
```

- [x] **Step 2: 통합 테스트가 기존 독립 카드 구조에서 실패하는지 확인**

Run: `cd frontend && npx vitest run app/mes/_components/_admin_sections/__tests__/AdminExportSection.test.tsx`

Expected: FAIL — 모드 그룹이 없고 독립 원본 로그 카드가 남아 있다.

- [x] **Step 3: AdminExportSection에 모드 상태와 조건부 본문 구현**

```tsx
type ExportMode = "general" | "audit";

const [mode, setMode] = useState<ExportMode>("general");

<ExportSurface
  ariaLabel="데이터 내보내기"
  tone={LEGACY_COLORS.blue}
  icon={<FileText className="h-5 w-5" />}
  title="데이터 내보내기"
  className="min-h-0 shrink-0 xl:flex-1 xl:overflow-hidden"
>
  <div role="group" aria-label="내보내기 유형" className="mt-4 flex flex-wrap gap-1.5">
    <FilterChip active={mode === "general"} label="일반 데이터" onClick={() => setMode("general")} />
    <FilterChip active={mode === "audit"} label="내부 원본 로그" onClick={() => setMode("audit")} />
  </div>

  {mode === "general" ? (
    <div data-testid="general-export-controls" className="mt-4 flex min-h-0 flex-1 flex-col">
      <div data-testid="export-control-panel" className="min-h-0 flex-1 xl:overflow-y-auto xl:pr-1">
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="데이터 범위">
            <Label>데이터 범위</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SCOPE_LABEL) as DataScope[]).map((option) => (
                <FilterChip
                  key={option}
                  active={scope === option}
                  label={SCOPE_LABEL[option]}
                  onClick={() => handleScopeChange(option)}
                  size="sm"
                  className="min-h-11"
                />
              ))}
            </div>
          </div>

          {supportsExcel && (
            <div data-testid="export-format-settings" role="group" aria-label="파일 형식">
              <Label>파일 형식</Label>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={format === "csv"} label="CSV" onClick={() => setFormat("csv")} size="sm" className="min-h-11" />
                <FilterChip active={format === "xlsx"} label="Excel" onClick={() => setFormat("xlsx")} size="sm" className="min-h-11" />
              </div>
            </div>
          )}

          {(includesTransactions || includesEmployees) && (
            <div className={`grid gap-4 ${includesTransactions && includesEmployees ? "md:grid-cols-2" : ""}`}>
              {includesTransactions && (
                <div data-testid="export-period-settings">
                  <Label>기간 선택</Label>
                  <div
                    className="rounded-[12px] border px-3 py-2 text-[14px] font-medium"
                    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  >
                    {range.start} ~ {range.end}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["today", "7d", "30d", "90d"] as RangePreset[]).map((option) => (
                      <FilterChip
                        key={option}
                        active={preset === option}
                        label={option === "today" ? "오늘" : option === "7d" ? "7일" : option === "30d" ? "30일" : "90일"}
                        onClick={() => setPreset(option)}
                        size="sm"
                        className="min-h-11"
                      />
                    ))}
                  </div>
                </div>
              )}

              {includesEmployees && (
                <div data-testid="export-inactive-option">
                  <Label>추가 옵션</Label>
                  <label
                    className="flex min-h-11 items-center gap-2 rounded-[12px] border px-3 text-[14px] font-medium"
                    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  >
                    <input
                      type="checkbox"
                      checked={includeInactive}
                      onChange={(event) => setIncludeInactive(event.currentTarget.checked)}
                      className="h-4 w-4 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--c-s2)]"
                      style={{ accentColor: LEGACY_COLORS.blue }}
                    />
                    비활성 데이터 포함
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className="mt-3 shrink-0 rounded-[12px] border px-3 py-2 text-[14px] font-bold"
          style={{
            background: feedback.kind === "error" ? LEGACY_COLORS.errorBg : LEGACY_COLORS.successBg,
            borderColor: feedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
            color: feedback.kind === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.green,
          }}
        >
          {feedback.message}
        </div>
      )}
      <div data-testid="export-download-action" className="mt-auto shrink-0 pt-4">
        <Button
          size="md"
          iconLeft={<Download />}
          loading={busy}
          onClick={() => void handleDataExport()}
          className="min-h-11 w-full"
        >
          {busy ? "내보내는 중..." : downloadLabel}
        </Button>
      </div>
    </div>
  ) : (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <AdminAuditCsvControls />
    </div>
  )}
</ExportSurface>
```

기존 `export-secondary-grid` 2열 래퍼와 `<AdminAuditCsvSection />`을 제거한다. 일반 데이터의 `scope`, `format`, `preset`, `includeInactive`, `feedback` 상태는 상위 컴포넌트에 그대로 두어 모드 전환 시 보존한다.

- [x] **Step 4: 기존 일반·공식 서식 테스트와 새 통합 테스트 실행**

Run: `cd frontend && npx vitest run app/mes/_components/_admin_sections/__tests__/AdminExportSection.test.tsx app/mes/_components/_admin_sections/__tests__/AdminAuditCsvControls.test.tsx`

Expected: PASS — 최상위 카드 3개, 지연 조회, 상태 보존과 기존 F704·F705·일반 데이터 다운로드가 모두 통과한다.

### Task 3: 문서 정합성과 프런트엔드 최종 검증 `GPT-5.6 Terra` `순차`

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-admin-export-unified-card-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-admin-export-independent-cards-design.md`
- Modify: `_attic/handoff/archive/2026-08-28-todo-baseline/2026-08-03-admin-export-followup-todo.md`

- [x] **Step 1: 새 설계 문서 상태를 구현 완료로 갱신**

```markdown
- 사용자 승인: 2026-08-04
- 구현 상태: 완료 (2026-08-04)
- 대체 대상: `2026-08-03-admin-export-independent-cards-design.md`의 하단 독립 카드 배치
```

- [x] **Step 2: 이전 이름과 독립 카드 결정의 남은 참조 확인**

Run: `rg -n "AdminAuditCsvSection|내부 원본 로그 \(월별\).*독립|xl:grid-cols-2" frontend docs/superpowers _attic/handoff`

Expected: 실행 코드와 현재 테스트에는 `AdminAuditCsvSection` 및 독립 2열 카드 참조가 없다. 이전 설계와 핸드오프의 기록성 문구는 상단 대체 상태와 함께 의도적으로 남는다.

- [x] **Step 3: 변경 파일의 포맷·타입·테스트를 프런트엔드 게이트로 검증**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend`

Result: 관련 Vitest 17개, lint, typecheck, production build, bundle-size gate는 성공했다. 전체 coverage gate는 이번 변경과 무관한 기존 색상 기대값 불일치 3건 때문에 실패했으며 이번 작업 범위에서는 수정하지 않았다.

- [x] **Step 4: 최종 변경 범위와 공백 오류 확인**

Run: `git status --short && git diff --check && git diff --stat`

Expected: 이번 기능의 프런트엔드·테스트·설계·핸드오프 파일만 변경되고 `git diff --check`가 출력 없이 성공한다.
