**추천 모델: GPT-5.6 Terra** - 프런트엔드 상태 저장과 기존 개인 설정 흐름을 함께 바꾸는 중간 규모 작업입니다.
**추천 추론 수준: 높음** - 임시 선택·저장 실패·사용자별 저장값 복원을 모두 회귀 없이 다뤄야 합니다.

# 설정 모달 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 데스크톱 사이드바의 테마와 표시 방식 제어를 큰 설정 모달 하나로 통합하고, 저장 시에만 두 개인 설정이 함께 적용되게 한다.

**Goal:** 데스크톱 사용자가 `설정` 모달에서 라이트/다크 테마와 세 가지 사이드바 표시 방식 중 하나를 선택해 저장할 수 있게 한다.

**Architecture:** 기존의 별도 토글 UI를 제거하고, 테마와 사이드바 모드의 읽기·저장을 단일 `useAppearancePreferences` 훅으로 옮긴다. `DesktopSidebar`는 현재 설정과 저장 함수를 훅에서 받아 큰 `AppearanceSettingsModal`에 전달하며, 모달은 저장 전까지 선택값을 로컬 초안 상태로만 보관한다.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide, Vitest, Testing Library.

---

## 실행 전략

**추천 모델: GPT-5.6 Terra** - 프런트엔드 상태 저장과 기존 개인 설정 흐름을 함께 바꾸는 중간 규모 작업입니다.

**추천 추론 수준: 높음** - 임시 선택·저장 실패·사용자별 저장값 복원을 모두 회귀 없이 다뤄야 합니다.

**팀 구성: 불필요** - 새 훅, 모달, 사이드바 연결, 테스트가 같은 인터페이스를 순차적으로 공유하므로 단독 실행이 더 안전합니다.

---

## 파일 구조

- Create: `frontend/app/mes/_components/useAppearancePreferences.ts`
  - 테마와 사이드바 모드의 초기 복원, DOM 적용, 로컬/로그인 사용자 저장을 한 곳에서 제공한다.
- Create: `frontend/app/mes/_components/AppearanceSettingsModal.tsx`
  - 큰 중앙 모달, 두 설정 카드, 임시 선택, 취소·저장·오류 UI를 담당한다.
- Create: `frontend/app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx`
  - 모달 초안 상태와 저장 UX를 검증한다.
- Modify: `frontend/app/mes/_components/DesktopSidebar.tsx`
  - 기존 두 토글을 `설정` 버튼과 모달로 교체하고 훅을 연결한다.
- Modify: `frontend/app/mes/_components/__tests__/DesktopSidebar.test.tsx`
  - 순환 토글 회귀 테스트를 직접 선택·저장 흐름으로 교체한다.
- Delete: `frontend/app/mes/_components/ThemeToggle.tsx`
- Delete: `frontend/app/mes/_components/SidebarModeToggle.tsx`
- Delete: `frontend/app/mes/_components/__tests__/SidebarModeToggle.test.tsx`

삭제할 세 파일의 이름과 import를 새 훅·모달 이름으로 모두 치환한 뒤, `rg -n "ThemeToggle|SidebarModeToggle" frontend docs _attic/docs`가 의도적인 과거 기록 외에는 결과를 내지 않음을 확인한다.

### Task 1: 개인 설정 훅의 계약과 실패 테스트 작성 `[GPT-5.6 Terra · 병렬 불가]`

**Files:**

- Create: `frontend/app/mes/_components/useAppearancePreferences.ts`
- Create: `frontend/app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx`

- [ ] **Step 1: 훅의 공개 타입과 모달 props를 먼저 정의한다.**

```ts
export type AppearanceTheme = "light" | "dark";

export type AppearancePreferences = {
  theme: AppearanceTheme;
  sidebarMode: SidebarMode;
};

export function useAppearancePreferences(): AppearancePreferences & {
  savePreferences: (next: AppearancePreferences) => Promise<void>;
};
```

```ts
type AppearanceSettingsModalProps = {
  open: boolean;
  preferences: AppearancePreferences;
  onClose: () => void;
  onSave: (next: AppearancePreferences) => Promise<void>;
};
```

- [ ] **Step 2: 모달의 실패 테스트를 작성하고 실패를 확인한다.**

```tsx
it("저장 전 선택은 배경 설정을 바꾸지 않고, 저장에 실패하면 모달과 초안을 유지한다", async () => {
  const onSave = vi.fn().mockRejectedValueOnce(new Error("network"));
  render(<AppearanceSettingsModal open preferences={{ theme: "light", sidebarMode: "hover" }} onClose={vi.fn()} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "다크 테마" }));
  await user.click(screen.getByRole("button", { name: "펼침 고정" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "light");

  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("설정을 저장하지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다크 테마" })).toHaveAttribute("aria-pressed", "true");
});
```

Run: `cd frontend; npm test -- AppearanceSettingsModal.test.tsx`

Expected: FAIL because `AppearanceSettingsModal` does not exist.

### Task 2: 개인 설정 복원·저장 훅 구현 `[GPT-5.6 Terra · 병렬 불가]`

**Files:**

- Create: `frontend/app/mes/_components/useAppearancePreferences.ts`
- Delete: `frontend/app/mes/_components/ThemeToggle.tsx`
- Delete: `frontend/app/mes/_components/SidebarModeToggle.tsx`

- [ ] **Step 1: 기존 초기값 우선순위를 보존한다.**

`useCurrentOperator()` 값이 있으면 `operator.theme`과 `operator.sidebar_mode`를 우선한다. 각각 없거나 유효하지 않을 때에는 `localStorage`의 `theme`과 `dexcowin_mes_sidebar_mode`를 사용하고, 마지막 기본값은 `light`와 `hover`로 둔다. `normalizeSidebarMode`를 계속 사용한다.

- [ ] **Step 2: 저장 전에는 화면을 바꾸지 않고, 저장 성공 후에만 두 값을 적용하는 함수를 구현한다.**

```ts
const nextOperator = operator
  ? { ...operator, theme: next.theme, sidebar_mode: next.sidebarMode }
  : null;

if (operator) {
  await Promise.all([
    api.setEmployeeTheme(operator.employee_id, next.theme),
    api.setEmployeeSidebarMode(operator.employee_id, next.sidebarMode),
  ]);
}

document.documentElement.setAttribute("data-theme", next.theme);
window.localStorage.setItem("theme", next.theme);
window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, next.sidebarMode);
if (nextOperator) setCurrentOperator(nextOperator);
setPreferences(next);
```

`Promise.all`이 거부되면 DOM, React 상태, 로컬 저장소, 세션 사용자 정보를 바꾸지 말고 오류를 호출자에게 전파한다. 서버 API는 기존 두 개를 재사용하고 새 API·DB 변경은 만들지 않는다.

- [ ] **Step 3: 이전 토글 컴포넌트와 전용 테스트 파일을 삭제할 준비를 한다.**

`ThemeToggle`과 `SidebarModeToggle` export를 더 이상 참조하지 않도록 새 훅에서 필요한 상수와 로직을 흡수한다. 이전 순환 UI와 `cycleMode`는 남기지 않는다.

### Task 3: 큰 설정 모달 구현 `[GPT-5.6 Terra · 병렬 불가]`

**Files:**

- Create: `frontend/app/mes/_components/AppearanceSettingsModal.tsx`
- Modify: `frontend/app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx`

- [ ] **Step 1: 생산 가능수량 상세의 모달 프레임을 따르는 접근 가능한 다이얼로그를 만든다.**

```tsx
<div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose}>
  <section
    role="dialog"
    aria-modal="true"
    aria-labelledby="appearance-settings-title"
    className="flex h-[min(900px,92vh)] w-full max-w-[min(1600px,97vw)] flex-col rounded-[28px] border"
    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    onClick={(event) => event.stopPropagation()}
  >
```

헤더에는 `설정` 제목과 `aria-label="닫기"` X 버튼을 둔다. 오버레이 클릭, X, `취소`는 `onClose`만 호출하며 초안을 저장하지 않는다.

- [ ] **Step 2: 두 개의 큰 선택 카드를 구현한다.**

```tsx
const sidebarOptions: Array<{ value: SidebarMode; label: string; description: string }> = [
  { value: "hover", label: "자동 펼침", description: "평소에는 접혀 있고 마우스를 올리면 펼쳐집니다." },
  { value: "collapsed", label: "접힘 고정", description: "항상 아이콘만 표시합니다." },
  { value: "expanded", label: "펼침 고정", description: "항상 전체 메뉴를 표시합니다." },
];
```

테마는 `라이트 테마`, `다크 테마`, 사이드바는 위 세 독립 버튼으로 표시한다. 각 버튼은 `aria-pressed`와 선택 강조를 사용하며, 클릭은 `draft`만 바꾼다. 모달이 새로 열리거나 `preferences`가 바뀌면 초안을 다시 현재값으로 초기화한다.

- [ ] **Step 3: 저장 상태와 오류 표시를 구현한다.**

```tsx
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);

async function handleSave(): Promise<void> {
  setSaving(true);
  setError(null);
  try {
    await onSave(draft);
    onClose();
  } catch {
    setError("설정을 저장하지 못했습니다. 다시 시도해 주세요.");
  } finally {
    setSaving(false);
  }
}
```

저장 중에는 두 선택 카드, 닫기, 취소, 저장 버튼의 중복 조작을 막고 저장 버튼 텍스트를 `저장 중…`으로 표시한다.

- [ ] **Step 4: 모달 단위 테스트를 통과시킨다.**

Run: `cd frontend; npm test -- AppearanceSettingsModal.test.tsx`

Expected: PASS. 취소·X·오버레이가 저장을 호출하지 않는 경우, 성공 저장이 선택한 두 값을 한 번 전달하고 닫는 경우, 실패 시 오류와 초안이 남는 경우를 모두 포함한다.

### Task 4: 사이드바 진입점과 저장 연결 `[GPT-5.6 Terra · 병렬 불가]`

**Files:**

- Modify: `frontend/app/mes/_components/DesktopSidebar.tsx`
- Modify: `frontend/app/mes/_components/__tests__/DesktopSidebar.test.tsx`
- Delete: `frontend/app/mes/_components/__tests__/SidebarModeToggle.test.tsx`

- [ ] **Step 1: 기존 토글 import와 하단 두 컴포넌트를 제거한다.**

`DesktopSidebar`에서 `ThemeToggle`, `SidebarModeToggle`, `useSidebarMode` import를 삭제하고 `useAppearancePreferences`, `AppearanceSettingsModal`, `Settings` Lucide 아이콘을 사용한다.

- [ ] **Step 2: 사이드바 하단에 하나의 설정 버튼을 추가한다.**

```tsx
const { preferences, savePreferences } = useAppearancePreferences();
const [settingsOpen, setSettingsOpen] = useState(false);

<button type="button" aria-label="설정" title="설정" onClick={() => setSettingsOpen(true)}>
  <Settings className="h-5 w-5" />
  {/* expanded일 때만 설정과 보조 설명을 보여 주는 기존 하단 버튼 전환 스타일 */}
</button>
<AppearanceSettingsModal
  open={settingsOpen}
  preferences={preferences}
  onClose={() => setSettingsOpen(false)}
  onSave={savePreferences}
/>
```

버튼의 아이콘 상자 크기, 접힘/펼침 텍스트 애니메이션, hover 배경은 기존 하단 제어의 46px·전환 패턴을 유지한다. 모바일 `MobileShell.tsx`와 frozen bottom tab bar는 건드리지 않는다.

- [ ] **Step 3: 사이드바 통합 테스트를 갱신한다.**

기존의 `cycles through collapsed, expanded, and hover behavior` 테스트는 다음으로 교체한다.

```tsx
fireEvent.click(await screen.findByRole("button", { name: "설정" }));
fireEvent.click(screen.getByRole("button", { name: "접힘 고정" }));
expect(sidebarSlot).toHaveStyle({ width: "220px" });

fireEvent.click(screen.getByRole("button", { name: "저장" }));
await waitFor(() => expect(sidebarSlot).toHaveStyle({ width: "72px" }));
expect(window.localStorage.getItem("dexcowin_mes_sidebar_mode")).toBe("collapsed");
```

로그인 사용자의 경우 기존 API mock을 사용해 테마 PUT과 사이드바 모드 PUT이 선택값으로 각각 한 번 호출되는지 확인한다. `취소` 후에는 두 API가 호출되지 않는 테스트도 추가한다.

- [ ] **Step 4: 관련 테스트를 실행한다.**

Run: `cd frontend; npm test -- AppearanceSettingsModal.test.tsx DesktopSidebar.test.tsx`

Expected: PASS.

### Task 5: 삭제 참조 점검과 변경 범위 검증 `[GPT-5.6 Terra · 병렬 불가]`

**Files:**

- Verify: `frontend/app/mes/_components/useAppearancePreferences.ts`
- Verify: `frontend/app/mes/_components/AppearanceSettingsModal.tsx`
- Verify: `frontend/app/mes/_components/DesktopSidebar.tsx`
- Verify: `frontend/app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx`
- Verify: `frontend/app/mes/_components/__tests__/DesktopSidebar.test.tsx`

- [ ] **Step 1: 이전 토글 이름과 순환 UI가 남지 않았는지 확인한다.**

Run: `rg -n "ThemeToggle|SidebarModeToggle|cycleMode" frontend/app frontend/lib _attic/docs docs`

Expected: 의도적인 과거 기록을 제외하고 코드와 활성 문서에는 결과가 없다.

- [ ] **Step 2: 타입과 대상 테스트를 실행한다.**

Run: `cd frontend; npx tsc --noEmit; npm test -- AppearanceSettingsModal.test.tsx DesktopSidebar.test.tsx`

Expected: exit code 0.

- [ ] **Step 3: 변경 파일 기준 로컬 검증을 실행한다.**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend`

Expected: frontend gate PASS.

- [ ] **Step 4: 수동 UI 확인을 수행한다.**

데스크톱에서 접힘·자동 펼침·펼침 고정 각각으로 설정을 저장한 뒤, 사이드바 폭과 hover 동작을 확인한다. 라이트·다크 각각에서 모달의 대조와 선택 강조를 확인하고, 취소·X·오버레이 클릭이 실제 화면을 바꾸지 않는지 확인한다. 저장 실패를 모의해 오류 메시지, 재시도 가능성, 이중 저장 방지를 확인한다.

## 자체 점검

- 명세 범위: 진입점 통합(Task 4), 큰 중앙 모달(Task 3), 직접 선택 버튼(Task 3), 저장 전 임시값(Task 3), 저장·실패 처리(Task 2~3), 기존 복원 경로(Task 2), 회귀 검증(Task 4~5)으로 모두 대응한다.
- 플레이스홀더: 없음. 모든 생성·변경·삭제 파일과 테스트 명령을 명시했다.
- 타입 일관성: `AppearanceTheme`, `AppearancePreferences`, `SidebarMode`, `savePreferences`, `AppearanceSettingsModalProps`를 전 작업에서 같은 이름으로 사용한다.
