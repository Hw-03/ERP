# 모바일 개선 통합 plan

> 두 사이클의 결과 통합:
> - **기능 결함** — [docs/mobile-feature-parity.md](docs/mobile-feature-parity.md) (직전, 5개)
> - **디자인/UX 감사** — [docs/mobile-design-audit.md](docs/mobile-design-audit.md) (방금, 26개)
>
> 본 plan 이 이후 구현의 단일 source of truth. 두 원본은 근거 자료로 유지.

## Context

DEXCOWIN MES 모바일 쉘은 데스크탑 5탭을 그대로 갖되 헤더 영역·디자인 시스템 정합성이 부족하다. 사용자가 "로그아웃 안 됨"을 시작으로 점검 요청 → Playwright 실측으로 기능 결함 5개 확정 → 디자이너 시니어 역할 감사로 UX 결함 26개 추가 식별. 본 plan 은 31개 항목을 3개 phase 로 묶고, 각 phase 의 PR 단위·검증 신호를 명시한다.

산출물은 **다음 사이클의 구현 PR 시리즈**가 따를 청사진. 사용자가 phase 우선순위·진행 여부를 결정하면 그에 맞춰 구현 시작.

## 단일 우선순위 표 (31개)

| Phase | 항목 | 출처 | 영향 | 변경 파일 수 |
|------|----|----|----|----:|
| **1** | 사용자 메뉴 시트 (로그아웃·PIN·프로필) | parity | 🔴 업무 차단 | 1-2 |
| **1** | 불량 진입 URL 동기화 | parity | 🔴 흐름 단절 | 2 |
| **1** | 관리자 잠금 버튼 | parity | 🟡 보안 | 1 |
| **2-a** | primitives 일괄 44px (A1·A2·A5·B2) | audit | 🔴 광범위 | 4 |
| **2-b** | sticky → fixed (H1) | audit | 🔴 입출고 흐름 | 1 |
| **2-c** | color-mix 메시지 대비 (C1) | audit | 🔴 가독성 | 1 (+토큰) |
| **2-d** | 입력 키보드 최적화 (E1·E2) | audit | 🟡 광범위 | 5+ |
| **2-e** | span[role=button] → button (D1) | audit | 🟡 접근성 | 1 |
| **2-f** | safe-area 적용 확장 (H2) | audit | 🟡 잘림 방지 | 2-3 |
| **2-g** | 상태 메시지 토스트화 (F1) | audit | 🟡 가독성 | 1 |
| **2-h** | 필터 스켈레톤·로딩 스피너 (F2·F3) | audit | 🟡 피드백 | 2 |
| **2-i** | 색·아이콘 일관성 (C2·C3·C5) | audit | ⚪ 정리 | 3-5 |
| **2-j** | 시각 위계 정리 (G1·G2·G3) | audit | ⚪ 정리 | 3 |
| **2-k** | 텍스트 토큰 사용처 audit (B1·B3·B4) | audit | ⚪ 정리 | 다수 (검색 기반) |
| **3** | 디자인 가이드 문서화 | audit 패턴 | 문서 | 1 (신규) |
| **3** | Android 백버튼 (H3) | audit | ⚪ PWA 전환 시 | 보류 |

🔴 7건 → Phase 1 + 2-a/b/c — 4개 PR
🟡 12건 → Phase 2-d~h — 5개 PR
⚪ 7건 → Phase 2-i/j/k — 3개 PR
문서 1건 → Phase 3 — 1개 PR

**총 12-13개 PR** (작업 단위로 묶음).

---

## Phase 1 — 기능 결함 수정

상세는 [docs/mobile-feature-parity.md](docs/mobile-feature-parity.md) 의 Group A/B/C 와 동일. 요점만:

### PR 1-A — 사용자 메뉴 시트

- **변경**: [MobileShell.tsx](frontend/app/legacy/_components/mobile/MobileShell.tsx) 헤더 좌측 아바타 + 새 컴포넌트 `MobileUserMenuSheet.tsx`
- **재사용**: `useCurrentOperator` ([useCurrentOperator.ts:83](frontend/app/legacy/_components/login/useCurrentOperator.ts#L83)) · `api.changeMyPin` · [BottomSheet](frontend/lib/ui/BottomSheet.tsx) · [DesktopTopbar.tsx:101-230](frontend/app/legacy/_components/DesktopTopbar.tsx#L101-L230) 의 모달 마크업
- **검증**: 헤더 아바타 → 시트 → "로그아웃" → `localStorage.dexcowin_mes_operator` null + 로그인 게이트 재출현

### PR 1-B — 불량 진입 URL 동기화

- **변경**:
  - [MobileShell.tsx:49-54](frontend/app/legacy/_components/mobile/MobileShell.tsx#L49) — `?defect_dept=` 도 읽어 state
  - [MobileWarehouseScreen.tsx](frontend/app/legacy/_components/mobile/screens/MobileWarehouseScreen.tsx) — `defectDeptFilter` prop pass-through
  - [MobileIoComposeWizard.tsx](frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx) — IoComposeViewProps 그대로 전달
- **재사용**: [IoComposeView.tsx:328-341](frontend/app/legacy/_components/_warehouse_v2/IoComposeView.tsx#L328-L341) 의 자동 진입 effect
- **검증**: 대시보드 [불량] 배지 클릭 → 작업 유형 "불량" pressed + Step 2 진입

### PR 1-C — 관리자 잠금

- **변경**: [MobileAdminScreen.tsx](frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx) 허브 헤더 우측 또는 SubScreenHeader.right 슬롯
- **재사용**: `useAdminViewState` 의 lock 액션 (없으면 추가)
- **검증**: PIN 풀고 → 잠금 → PIN 게이트 재출현

---

## Phase 2 — 디자인 시스템 정합화

각 PR 단위. 작업 단위가 같으면 묶음.

### PR 2-a — primitives 44px 일괄

- **변경**:
  - [IconButton.tsx:11-15](frontend/app/legacy/_components/mobile/primitives/IconButton.tsx#L11) — `SIZE.sm` 폐기 또는 box 만 `h-11 w-11`로 변경 (icon 16 유지로 시각 작음 보존)
  - [Stepper.tsx:50,69](frontend/app/legacy/_components/mobile/primitives/Stepper.tsx#L50) — `h-10` → `min-h-[44px]`
  - [SummaryChipBar.tsx:62](frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx#L62) — X 영역 hit area 44 확장 (시각 18 유지)
  - [SheetHeader.tsx:36](frontend/app/legacy/_components/mobile/primitives/SheetHeader.tsx#L36) — X 버튼 sm 사용처 일괄 점검
  - [MobileHistoryScreen.tsx:431](frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx#L431) — "뒤로" `min-h-[36px]` → 44
  - [MobileShell.tsx:240](frontend/app/legacy/_components/mobile/MobileShell.tsx#L240) — 탭 레이블 `text-[11px]` → `text-xs`
- **검증**: Playwright 측정 — 모든 `<button>`·인터랙티브 요소의 `getBoundingClientRect()` `min(w,h) ≥ 44`

### PR 2-b — sticky → fixed

- **변경**: [MobileIoComposeWizard.tsx:702](frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx#L702) — `sticky` → `fixed` + 부모 padding-top
- **검증**: 입출고 위저드에서 빠르게 스크롤 → 헤더 깜빡임 없음. 실기기 테스트 필수 (Chromium 으로 충분치 않음)
- **위험**: iOS Safari 의 `100dvh` 와 충돌 가능 — 실기기 검증 후 머지

### PR 2-c — 메시지 대비 토큰

- **변경**:
  - [color.ts](frontend/lib/mes/color.ts) — `LEGACY_COLORS` 에 `successBg`·`errorBg`·`warningBg` 추가 (불투명, WCAG AA 4.5:1)
  - [MobileAdminScreen.tsx:165-184](frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx#L165) — `color-mix(...)` → 새 토큰
  - 데스크탑 동일 패턴 사용처 검색·치환
- **검증**: 라이트/다크 모두에서 대비 측정 (Chrome DevTools Lighthouse)

### PR 2-d — 입력 키보드 최적화

- **변경**:
  - [InlineSearch.tsx](frontend/app/legacy/_components/mobile/primitives/InlineSearch.tsx) — `inputMode="search"` + `enterKeyHint="search"`
  - 숫자 입력 (수량·금액) 사용처 — `inputMode="numeric"`
  - [globals.css](frontend/app/globals.css) — `input, textarea { font-size: 16px; }` 모바일 미디어 쿼리 안에 (iOS 자동 줌 방지)
- **검증**: iOS Safari 에뮬레이션 또는 실기기 — 검색 input 포커스 시 줌 없음, 키보드 "이동" 키가 "검색"

### PR 2-e — span[role=button] → button

- **변경**: [SummaryChipBar.tsx:50-67](frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx#L50) — `<span role="button">` → `<button type="button">`, keyDown 핸들러 제거
- **검증**: VoiceOver/TalkBack 으로 X 버튼 탐색 → "버튼" 안내

### PR 2-f — safe-area 확장

- **변경**:
  - [StickyFooter.tsx](frontend/app/legacy/_components/mobile/primitives/StickyFooter.tsx) 패턴을 BottomSheet 푸터에 적용
  - [BottomSheet](frontend/lib/ui/BottomSheet.tsx) 자체에 `paddingBottom: env(safe-area-inset-bottom)` 옵션 추가
- **검증**: iOS 노치 기기 또는 에뮬레이션에서 버튼이 홈 인디케이터에 가리지 않음

### PR 2-g — 상태 메시지 토스트화

- **변경**: [MobileShell.tsx:67-73](frontend/app/legacy/_components/mobile/MobileShell.tsx#L67) — 3초 자동 사라짐 → 최근 5건 토스트 큐 또는 sticky 메시지 + 닫기 버튼
- **재사용**: [Toast.tsx](frontend/lib/ui/Toast.tsx) 가 이미 있을 가능성
- **검증**: 실패 메시지가 끝까지 사용자에게 도달 (시간 무관)

### PR 2-h — 로딩 스피너 표준화

- **변경**:
  - [MobileDashboardScreen.tsx:258-270](frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx#L258) — 필터 변경 시 스켈레톤 100-200ms
  - [MobileHistoryList.tsx:165-179](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L165) — "더 보기" 로딩 시 `<Loader2 className="animate-spin" />`
- **검증**: 느린 네트워크 시뮬레이션 (3G slow) 에서 로딩 상태 시각 확인

### PR 2-i — 색·아이콘 일관성

- **변경**:
  - [MobileAdminScreen.tsx:148-150](frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx#L148) — 토글 색 패턴 정리
  - [MobileHistoryList.tsx:160-161](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L160) — `외 N건` 띄어쓰기 통일
  - 아이콘 크기 토큰 — [IconButton.tsx:11](frontend/app/legacy/_components/mobile/primitives/IconButton.tsx#L11) SIZE 표를 4단계(16/20/24/28) 로
- **검증**: 같은 동작 데스크탑↔모바일 시각 비교

### PR 2-j — 시각 위계

- **변경**:
  - [MobileHistoryList.tsx:93-110](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L93) — 폰트 굵기 3 → 2종
  - [SectionCard.tsx:36,44](frontend/app/legacy/_components/mobile/primitives/SectionCard.tsx#L36) — 제목 토큰 격상
  - [SegmentedControl.tsx:55-70](frontend/app/legacy/_components/mobile/primitives/SegmentedControl.tsx#L55) — 배지 자간
- **검증**: 카드/탭/섹션의 위계 5단계 이하 유지 (디자이너 시각 점검)

### PR 2-k — TYPO 사용처 audit

- **변경**: `TYPO.caption` 사용처 grep → 본문은 `TYPO.body`로, 보조만 caption 유지
- **변경 파일**: 검색 결과에 따라 5-15개 추정
- **검증**: PR 단위로 컴포넌트별 정리

---

## Phase 3 — 디자인 가이드 문서화

### PR 3-A — `docs/mobile-design-system.md` 작성

내용:
- 토큰 카탈로그 — LEGACY_COLORS 17개 키의 의미·사용 시점·다크 변환
- TYPO 6단계 — 어디서 어떤 토큰을 써야 하는지 표
- primitives 25개 카탈로그 — 한 줄 설명 + 권장 사용처 + 금지 사용처
- 모바일 체크리스트 — 신규 컴포넌트 추가 시 5분 점검 (44px / 14px / button 시맨틱 / inputMode / safe-area)
- LEGACY_COLORS 추가 규칙 — 새 토큰 추가 절차

### PR 3-B (보류)

- Android 백버튼 — PWA/Capacitor 전환 시점에 재개
- Figma 시안 — 별도 사이클

---

## Phase 간 의존성

- Phase 1 ← 독립 (즉시 진행 가능)
- Phase 2-a (primitives 44px) ← 모든 Phase 2 의 기준점. 가장 먼저
- Phase 2-c (메시지 토큰) → Phase 2-i 일관성 작업의 일부
- Phase 2-d (키보드) ← 독립
- Phase 2-b (sticky→fixed) ← **실기기 검증 후** 머지
- Phase 3 ← Phase 2 작업이 어느 정도 마무리된 뒤에 (문서가 코드를 반영해야)

권장 진행 순서:

```
Phase 1 (병렬 가능, 3 PR)
  ├─ PR 1-A 사용자 메뉴
  ├─ PR 1-B 불량 진입
  └─ PR 1-C 관리자 잠금

Phase 2 (순차 권장)
  ├─ PR 2-a primitives 44px        ← 우선
  ├─ PR 2-c 메시지 토큰
  ├─ PR 2-d 키보드 최적화
  ├─ PR 2-e 접근성
  ├─ PR 2-f safe-area
  ├─ PR 2-g 토스트
  ├─ PR 2-h 로딩
  ├─ PR 2-i 일관성
  ├─ PR 2-j 위계
  ├─ PR 2-k TYPO audit
  └─ PR 2-b sticky→fixed             ← 실기기 검증 후

Phase 3
  └─ PR 3-A 가이드 문서
```

---

## Verification (통합)

Phase 1 통합 검증 (Playwright 모바일 뷰포트):
1. 헤더 아바타 → 시트 → 로그아웃 / PIN 변경 / 프로필 확인
2. [불량] 배지 클릭 → 작업유형 "불량" pressed
3. admin PIN 풀고 → 잠금 → 게이트 재출현

Phase 2 종합 검증:
- Playwright 자동 측정 — 모든 클릭 가능 요소 `min(w,h) ≥ 44` (스크립트)
- Playwright 자동 측정 — 본문 텍스트 `font-size ≥ 14` (스크립트)
- WCAG AA 색 대비 — Lighthouse 모바일 모드
- iOS Safari 실기기 — 입력 줌 / sticky 깜빡임 / safe-area / 키보드 가림
- VoiceOver/TalkBack — 접근성 spot check 3개 화면

Phase 3 검증:
- 문서가 코드와 어긋나지 않음 (PR 머지 시 코드 변경하면 문서도 갱신)

---

## 명시적 비범위 (이번 plan 에서 다루지 않음)

- 권한별 화면 (이필욱 단일 계정 기준) — 다음 사이클
- iOS Safari 실기기 정밀 검증 — Phase 2-b 머지 직전 1회만
- 다크 모드 색 대비 — 모바일 다크 토글 자체 없음 → Phase 3 가이드 문서에서 정리
- Figma 시안 / 디자인 핸드오프 — 별도
- 주간보고 화면 — [CLAUDE.md](CLAUDE.md) 동결 정책에 따라 손대지 않음 (2026-05-24)

---

## 다음 액션

사용자가 결정해야 할 것:
1. Phase 1·2 중 어느 것부터 시작?
2. PR 묶음 단위 동의? (특히 PR 2-a 의 6개 파일 묶음)
3. Phase 3 (가이드 문서) 우선순위 — 코드 작업 후? 또는 병행?

답변에 맞춰 구현 사이클 시작.
