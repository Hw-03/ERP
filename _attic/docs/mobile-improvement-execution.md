# 모바일 개선 실행 보고

> [docs/mobile-improvement-plan.md](docs/mobile-improvement-plan.md) 의 Phase 1·2 를 6 워커 병렬로 실행한 결과.
> 실행일: 2026-05-27 12:09 ~ 12:41 (32분). 점심시간 동안 자율 진행.
> 사용자 복귀 시 검토·머지 결정용.

## 한눈에 보기

| Worker | 작업 | 브랜치 | commit | 상태 |
|----|----|----|----|----|
| 1 | MobileShell 묶음 | `worktree-agent-a7f532ad8ccf28cf5` | `9a0c79c5` | ✅ |
| 2 | Warehouse | `worktree-mobile-defect-fixed` | `8e7d54d6` | ✅ |
| 3 | Admin + 색 토큰 | `worktree-agent-ab11583c91c9bfb80` | `904726ef` | ✅ |
| 4 | Primitives | `worktree-agent-a3f21fc06f00702b8` | `0cdcc81a` | ✅ |
| 5 | History | `mobile-history-polish` | `79d94b94` | ✅ |
| 6 | 글로벌·검색 | **main 에 직접** | `ba3b998d` | ⚠ 격리 실패 |

총 **23개 파일 변경** (W6 중복 제외, 신규 1개 + 수정 17개 + globals.css 공통). 모든 워커 `npm run build` 통과 보고.

## 워커별 변경 상세

### Worker 1 — MobileShell 묶음 (9a0c79c5)
- `mobile/MobileShell.tsx` (+107 / -20) — 헤더 아바타·토스트 큐(최대 5건)·`?defect_dept=` URL 읽기·탭 텍스트 `text-[11px]` → `text-xs`
- `mobile/MobileUserMenuSheet.tsx` (+255 신규) — BottomSheet 기반 사용자명·부서·권한 + PIN 변경 3단계 + 로그아웃
- `mobile/screens/MobileWarehouseScreen.tsx` (+4) — `defectDeptFilter` prop placeholder (W2 가 실사용)

### Worker 2 — Warehouse (8e7d54d6)
- `mobile/screens/MobileWarehouseScreen.tsx` (+3) — prop 실제 사용 (W1 placeholder 대체)
- `mobile/warehouse/MobileIoComposeWizard.tsx` (+22 / -3) — `defectDeptFilter` destructure + auto-apply effect + 헤더 `sticky → fixed` + 본문 `pt-14`

### Worker 3 — Admin + 색 토큰 (904726ef)
- `lib/mes/color.ts` (+6) — `LEGACY_COLORS.successBg`·`errorBg`·`warningBg` 신규 토큰 3개
- `app/globals.css` (+9) — 라이트(`#e6f7f2`·`#fdeaea`·`#fef6e4`)/다크(`#0a2420`·`#2b0d0d`·`#261d00`) 두 모드 변수
- `mobile/screens/MobileAdminScreen.tsx` (+38 / -7) — 허브 잠금 버튼 + 토글 색 일관화 + 메시지 배경 신규 토큰 치환
- WCAG 대비: 라이트 success 5.1:1 / error 5.5:1, 다크 모두 4.5:1 초과 (수계산)

### Worker 4 — Primitives (0cdcc81a)
- `mobile/primitives/IconButton.tsx` — sm `h-9 w-9` → `h-11 w-11`, 아이콘 16 유지
- `mobile/primitives/Stepper.tsx` — ± 버튼 `h-10 w-10` → `min-h-[44px] min-w-[44px]` (2곳)
- `mobile/primitives/SummaryChipBar.tsx` — `span[role=button] + onKeyDown` → `button[type=button]` + 44px hit area (negative margin)
- `mobile/primitives/SegmentedControl.tsx` — 배지 `gap-1 → 1.5`, `text-[10px] → [11px]`
- `mobile/primitives/SectionCard.tsx` — 제목 `TYPO.overline` → `TYPO.title` 위계 역전 해소
- BottomSheet safe-area 는 이미 `calc(env(safe-area-inset-bottom, 16px) + 20px)` 적용됨 — 변경 불필요

### Worker 5 — History (79d94b94)
- `mobile/screens/MobileHistoryScreen.tsx` — 뒤로 `min-h-[36px] → 44`
- `mobile/history/MobileHistoryList.tsx` — `Loader2` 더보기 스피너 + 카드 `font-black → font-bold` 2곳 (3종 → 2종)
- `mobile/screens/MobileDashboardScreen.tsx` — `filterChanging` state + 200ms effect 로 필터 변경 시 스켈레톤
- "외 N건" 띄어쓰기는 이미 통일됨 — 변경 불필요

### Worker 6 — 글로벌 (ba3b998d, main 직접)
- `app/globals.css` (+9) — `@media (max-width: 1023px) { input, textarea, select { font-size: 16px } }` iOS 자동 줌 방지
- `mobile/primitives/InlineSearch.tsx` — `inputMode="search"` + `enterKeyHint="search"`
- `mobile/primitives/Stepper.tsx` — `inputMode="numeric"`
- `mobile/primitives/ErrorAlert.tsx` — TYPO.caption → body (메시지 본문)
- `mobile/primitives/PersonAvatar.tsx` — TYPO.caption → body (이름 라벨)
- 나머지 24개 caption 사용처는 보조정보 (라벨/상태/메타) 로 판정해 유지

## 충돌 분석 (사용자 머지 시 참고)

### 🔴 conflict — W1 vs W2: `MobileWarehouseScreen.tsx`

W1·W2 둘 다 prop 추가 (`defectDeptFilter?: string | null`). 같은 라인 범위 변경.

| | W1 | W2 |
|--|----|----|
| destructure | `defectDeptFilter: _defectDeptFilter` (eslint-disable) | `defectDeptFilter` |
| type | `defectDeptFilter?: string | null` + "Worker 2 연동 예약" 주석 | `defectDeptFilter?: string | null` |
| 하위 전달 | 없음 (placeholder) | `<MobileIoComposeWizard defectDeptFilter={defectDeptFilter} ...>` |

**해결**: W2 의 코드가 정답. 머지 시 W2 채택, W1 placeholder 제거.

### 🟡 auto-merge — W6 vs W4: `Stepper.tsx`
- W6 line 55: `inputMode="numeric"` 추가 (input 내부)
- W4 line 47, 66: ± button `h-10 w-10` → `min-h-[44px] min-w-[44px]`
- 다른 라인 — git auto-merge 성공 예상

### 🟡 auto-merge — W6 vs W3: `globals.css`
- W6 line 117 부근: 모바일 미디어 쿼리 input font-size
- W3 line 29, 81 부근: 라이트/다크 변수 정의 (successBg/errorBg/warningBg)
- 다른 섹션 — auto-merge 성공 예상

### ⚪ 독립 — 나머지
- W3 의 `color.ts`, W3·W4 의 primitives, W5 의 history 파일 모두 다른 워커와 겹침 없음

## 권장 머지 순서

```
main (ba3b998d, W6 포함)
  ↓
1. W3 (904726ef) — color.ts·globals.css 변수·MobileAdminScreen
  ↓
2. W4 (0cdcc81a) — primitives 5개
  ↓
3. W5 (79d94b94) — history 3개
  ↓
4. W2 (8e7d54d6) — MobileWarehouseScreen·MobileIoComposeWizard
  ↓
5. W1 (9a0c79c5) — MobileShell·MobileUserMenuSheet
      ↑ MobileWarehouseScreen 에서 W2 와 conflict 발생
        해결: W2 의 코드 채택, W1 의 placeholder 제거
```

이 순서면 W6 의 globals.css·Stepper 변경이 base 에 있으므로 다른 worktree 의 변경이 위에 자연스럽게 쌓임. **W1·W2 의 conflict 한 건만 수동 해결 필요**.

또는 **PR 단위로 GitHub 에서 머지**할 경우 GitHub UI 의 conflict 해결 가능. 각 워크트리 → 별도 PR → 순차 머지.

## 검증 결과

**자동 검증** (각 워커 보고 기준):
- ✅ W1·W2·W3·W4·W5·W6 모두 `cd frontend; npm run build` 통과
- ✅ typecheck 에러 0건
- ✅ 데스크탑 시각 무변경 원칙 — 각 워커가 데스크탑 컴포넌트(`Desktop*`·`_admin_sections/`·`_history_sections/`) 무수정 확인

**수동 검증 미실시** (사용자 결정 필요):
- ⏳ Playwright 모바일 뷰포트로 6 워커 통합 후 5탭 시각 회귀
- ⏳ iOS Safari 실기기 — `sticky → fixed` 의 `100dvh` 충돌, 입력 자동 줌
- ⏳ Lighthouse 색 대비 (W3 의 새 토큰) — 라이트/다크 모두
- ⏳ VoiceOver — W4 의 button 시맨틱 변경 확인

## 워크트리 정리 안내

머지 완료 후:
```
git worktree remove c:\ERP\.claude\worktrees\agent-a7f532ad8ccf28cf5
git worktree remove c:\ERP\.claude\worktrees\agent-mobile-defect-fixed
git worktree remove c:\ERP\.claude\worktrees\agent-ab11583c91c9bfb80
git worktree remove c:\ERP\.claude\worktrees\agent-a3f21fc06f00702b8
git worktree remove c:\ERP\.claude\worktrees\agent-mobile-history-polish
```

자율 모드에서는 정리하지 않음 — 사용자가 검토 후 수동.

## 미해결·결정 필요

1. **Worker 6 가 main 에 직접 commit** (`ba3b998d`) — 격리 실패. 그대로 두고 머지 진행 vs `git reset --soft HEAD~1` + 별도 브랜치 분리. 변경 자체는 양호하므로 그대로 권장.
2. **W1 ↔ W2 conflict 해결 시점** — 머지 순서에 W2 를 W1 보다 먼저 두면 conflict 가 W1 머지에서 발생. 반대 순서면 W2 머지에서 발생. 결과는 동일.
3. **Phase 3 (디자인 가이드 문서)** — [docs/mobile-design-system.md](docs/mobile-design-system.md) 별도 작성됨 (Worker 7 의 작업 대응).

## 비범위 (재확인)

- 권한별(창고담당/부서승인자) 검증 — 다음 사이클
- iOS Safari 실기기 — 사용자 직접 또는 별도 검증 사이클
- Figma 시안 — 본 plan 범위 밖
- Android 백버튼 — PWA 전환 시점
- 주간보고 화면 — [CLAUDE.md](CLAUDE.md) 동결 정책 (2026-05-24)
