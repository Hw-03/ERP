# 모바일 화면 UI/UX 감사 보고서

> 감사자: claude (10년차 모바일 시니어 디자이너 역할)
> 감사 일자: 2026-05-27
> 감사 대상: DEXCOWIN MES 모바일 쉘 — 5탭 + admin 7섹션
> 검증 기준: iOS HIG (44pt 터치 / body 17pt), Material Design 3 (48dp / 14sp), 자체 토큰([LEGACY_COLORS](frontend/lib/mes/color.ts) · [TYPO](frontend/app/legacy/_components/mobile/tokens.ts))
> 시각 자료: [.playwright-mcp/mobile-audit-*.png](.playwright-mcp/) (Playwright 모바일 뷰포트 390×844)

## 디자인 시스템 한 줄 진단

**중기(Proto-system)** — 토큰(LEGACY_COLORS 17개)·primitives(25개)·타이포(TYPO 6단계)·아이콘(lucide)이 갖춰져 있고 토큰 사용률 82%로 양호하나, **공식 가이드 문서 부재** + **모바일 권장값(44px·14px) 위반이 primitives 내부에 박혀있어 화면 단위로는 못 고침**. 가이드 문서 작성 + primitives 일괄 수정이 핵심.

---

## 결함 총괄표

| 카테고리 | 🔴 긴급 | 🟡 필요 | ⚪ 낮음 | 합계 |
|--------|------:|------:|------:|----:|
| 터치 영역 (44px 미만) | 4 | 1 | 0 | 5 |
| 텍스트 크기 (14px 미만 본문 / 12px 미만 보조) | 1 | 3 | 0 | 4 |
| 색·일관성 일탈 | 1 | 2 | 2 | 5 |
| 접근성 | 0 | 1 | 0 | 1 |
| 입력/키보드 최적화 | 0 | 2 | 0 | 2 |
| 인터랙션·피드백 | 0 | 2 | 1 | 3 |
| 시각 위계·노이즈 | 0 | 0 | 3 | 3 |
| 모바일 친화 (sticky·safe-area·백버튼) | 1 | 1 | 1 | 3 |
| **합계** | **7** | **12** | **7** | **26** |

호버 의존 0건 — ✓ 양호.

---

## 결함 상세 (26항)

각 결함: **위치** / **심각도** / **권장 수정** / **데스크탑 대응**

### A. 터치 영역 (5)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| A1 | [Stepper.tsx:50,69](frontend/app/legacy/_components/mobile/primitives/Stepper.tsx#L50) — ± 버튼 `h-10` (40px) | 🔴 | `h-10` → `min-h-[44px] min-w-[44px]` | 데스크탑은 수량 입력에 키보드 — Stepper 없음. 모바일 단독 위반 |
| A2 | [IconButton.tsx:12](frontend/app/legacy/_components/mobile/primitives/IconButton.tsx#L12) — `sm = h-9 w-9` (36×36) | 🔴 | `sm` 사이즈 폐기 또는 `h-11 w-11`로 격상. 시각만 작게 하려면 box 44px + icon 16 유지 | 데스크탑 DesktopIconButton sm 사용처는 별도 — 모바일에서는 sm 금지 |
| A3 | [SummaryChipBar.tsx:62](frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx#L62) — X 아이콘 영역 18×18 | 🔴 | hit area 44×44 (시각은 18 유지 가능, 패딩으로 영역 확장) | 데스크탑은 호버 시 X 표시 — 모바일은 항시 노출 + 영역 확장 |
| A4 | [MobileHistoryList.tsx:81,136](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L81) — 배지 `px-2.5 py-1` | 🟡 | 배지 자체는 비클릭이면 OK. 클릭 가능이면 부모 행 hit area 가 행 전체일 것 — 확인 필요 | 데스크탑 테이블 배지와 동일 시각 OK |
| A5 | [MobileHistoryScreen.tsx:431](frontend/app/legacy/_components/mobile/screens/MobileHistoryScreen.tsx#L431) — "뒤로" 버튼 `min-h-[36px]` | 🔴 | `min-h-[44px]` | BottomSheet 표준 (모달 닫기) |

### B. 텍스트 크기 (4)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| B1 | [tokens.ts:6](frontend/app/legacy/_components/mobile/tokens.ts#L6) — `TYPO.caption = text-xs` (12px) | 🔴 | caption 은 보조 정보만 (12px 유지 가능). **본문에 caption 쓰는 곳을 body 로 바꾸는 게 더 중요**. 사용처 audit 필요 | 데스크탑은 동일 토큰 공유 — 일관성을 위해 토큰은 유지, 사용처 변경 |
| B2 | [MobileShell.tsx:240](frontend/app/legacy/_components/mobile/MobileShell.tsx#L240) — 탭 레이블 `text-[11px]` | 🟡 | `text-xs` (12px) 로 격상. 5탭이라 폭 여유 있음 | 데스크탑 사이드바 메뉴는 14px (`text-sm`) |
| B3 | [IconButton.tsx:64](frontend/app/legacy/_components/mobile/primitives/IconButton.tsx#L64) — 배지 `text-[10px]` | 🟡 | `text-[11px]` 까지만 격상 (배지 협소). 또는 99+ 위주 단순화 | 데스크탑 동일 — 함께 격상 |
| B4 | [SegmentedControl.tsx:58](frontend/app/legacy/_components/mobile/primitives/SegmentedControl.tsx#L58) — 배지 `text-[10px]` | 🟡 | B3과 동일 | 동일 |

### C. 색·일관성 일탈 (5)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| C1 | [MobileAdminScreen.tsx:165-184](frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx#L165) — 성공/에러 메시지가 `color-mix(in srgb, LEGACY_COLORS.green 14%, transparent)` 배경. 부모가 `LEGACY_COLORS.bg` 가 아니라 `s1` 인 경우 시각 대비 부족 | 🔴 | 토큰화: `LEGACY_COLORS.successBg`·`errorBg` 추가 또는 불투명 색 사용. WCAG AA 4.5:1 확인 | 데스크탑 동일 패턴 — 토큰 추가 시 함께 적용 |
| C2 | [MobileAdminScreen.tsx:148-150](frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx#L148) — "요약" 토글 텍스트색이 활성/비활성 모두 `white`·`muted` 혼용 | 🟡 | 활성=`blue` 배경+`white` 텍스트, 비활성=`s2` 배경+`text` 색 일관 | DesktopAdminView 사이드바 토글 패턴 |
| C3 | [MobileHistoryList.tsx:160-161](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L160) — 배치 표기 ` 외 {N}건` 띄어쓰기 모바일/데스크탑 다름 | 🟡 | 통일: `외 N건` (앞 공백 제거 또는 추가) | [DesktopHistoryView 의 동일 포맷](frontend/app/legacy/_components/_history_sections/) 확인해 모바일에 맞춤 |
| C4 | [MobileDashboardScreen.tsx:278](frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx#L278) — BottomSheet 닫기는 X / 데스크탑 SlidePanel 은 X 없음 (외부 클릭으로 닫음) | ⚪ | 모바일 X 유지, 데스크탑도 X 추가 권장 (일관성) | DesktopInventoryRightPanel — X 추가 가능 |
| C5 | 아이콘 크기 분포 — 12/13/14/16/18/20/22/24 px 혼재 | ⚪ | 4단계로 표준화: 16(인라인) / 20(액션) / 24(헤딩) / 28(피처). [IconButton.tsx:11](frontend/app/legacy/_components/mobile/primitives/IconButton.tsx#L11) 의 SIZE 표 갱신 | 데스크탑 동일 토큰 사용 |

### D. 접근성 (1)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| D1 | [SummaryChipBar.tsx:50-67](frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx#L50) — `<span role="button" tabIndex={0}>` + 수동 keyDown 핸들러 | 🟡 | `<button type="button">` 으로 교체. iOS VoiceOver·Android TalkBack 모두 button 시맨틱 권장. 기존 keyDown 코드 삭제 가능 | 데스크탑도 동일 패턴이면 함께 수정 |

### E. 입력/키보드 (2)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| E1 | [InlineSearch.tsx](frontend/app/legacy/_components/mobile/primitives/InlineSearch.tsx) 등 일반 input — `inputMode`·`enterKeyHint` 누락 | 🟡 | 검색: `inputMode="search"` + `enterKeyHint="search"`. 숫자: `inputMode="numeric"`. PIN 은 이미 적용([PinInput.tsx:38-39](frontend/app/legacy/_components/mobile/primitives/PinInput.tsx#L38)) | 데스크탑은 영향 없음 (키보드 비노출) — 모바일 단독 |
| E2 | iOS Safari 입력 필드 자동 확대 — input `font-size: 16px` 미만이면 포커스 시 viewport 줌 | 🟡 | input·textarea 일괄 `text-base` (16px) 또는 globals.css 에 `input,textarea { font-size: 16px; }` 강제 | 데스크탑 영향 없음 |

### F. 인터랙션·피드백 (3)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| F1 | [MobileShell.tsx:67-73](frontend/app/legacy/_components/mobile/MobileShell.tsx#L67) — 상태 메시지 3초 자동 사라짐 | 🟡 | 토스트 로그 보관 (최근 5건) 또는 sticky 메시지에 닫기 버튼. 청각 장애·느린 네트워크 사용자 배려 | 데스크탑은 헤더에 상태 표시 영역 더 큼 — 모바일 단독 |
| F2 | [MobileDashboardScreen.tsx:258-270](frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx#L258) — 필터 변경 시 스켈레톤 미표시 (displayLimit 즉시 변경) | 🟡 | 필터 적용 시 0.1초라도 spinner. 또는 로딩 상태 유지 100-200ms | 데스크탑은 즉시 반영 OK (성능 차이) |
| F3 | [MobileHistoryList.tsx:165-179](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L165) — "더 보기" 로딩 시 `disabled:opacity-50` 만, 진행 스피너 없음 | ⚪ | `<Loader2 className="animate-spin" />` 추가 | 데스크탑 무한 스크롤 — 패턴 다름 |

### G. 시각 위계 (3)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| G1 | [MobileHistoryList.tsx:93-110](frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx#L93) — 한 카드 안에 폰트 굵기 3종(`bold`·`black`·`semibold`) + 크기 3종(`xs`·`sm`·`xs`) | ⚪ | 2종으로 축약 (예: `font-bold` + `font-semibold` 만, 크기는 14/12 2단) | 데스크탑 테이블 행과 비교 — 표 컬럼은 카드보다 단순. 일관 어려움 |
| G2 | [SectionCard.tsx:36,44](frontend/app/legacy/_components/mobile/primitives/SectionCard.tsx#L36) — 제목 `overline`(11px) + 부제 `body`(14px) 위계 역전 | ⚪ | 제목을 `title`(16px) 으로 격상, overline 은 라벨용으로만 | 데스크탑 동일 토큰 |
| G3 | [SegmentedControl.tsx:55-70](frontend/app/legacy/_components/mobile/primitives/SegmentedControl.tsx#L55) — 탭 텍스트 12px + 배지 10px 자간 좁음 | ⚪ | 배지·탭 사이 gap 추가, 배지 11px | 데스크탑 동일 |

### H. 모바일 친화 (3)

| # | 위치 | 심각 | 권장 수정 | 데스크탑 대응 |
|---|------|----|--------|----------|
| H1 | [MobileIoComposeWizard.tsx:702](frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx#L702) — `position: sticky` 헤더 — 스크롤 중 깜빡임 가능 (iOS Safari 알려진 이슈) | 🔴 | `position: fixed` + 부모 padding-top 으로 영역 확보. 실기기 테스트 필수 | 데스크탑은 sticky OK (Safari 데스크탑 다름) |
| H2 | [StickyFooter.tsx:14-21](frontend/app/legacy/_components/mobile/primitives/StickyFooter.tsx#L14) — `safe-area-inset-bottom` 처리됨. BottomSheet 푸터에는 미적용 | 🟡 | BottomSheet 의 submit 버튼 영역에 `paddingBottom: env(safe-area-inset-bottom)` 추가 | 데스크탑 영향 없음 |
| H3 | Android 하드웨어 백버튼 처리 — BottomSheet/모달 안에서 뒤로 누르면 페이지 자체가 빠져나감 | ⚪ | 향후 Capacitor/PWA 전환 시 `useEffect` + popstate 이벤트로 처리. 현재 웹은 보류 가능 | 데스크탑 영향 없음 |

---

## 발견된 패턴 (3가지)

1. **모바일 primitives 의 `sm` 사이즈는 전부 44px 미만** — IconButton sm (36), Stepper ± (40), SheetHeader X (36), 일부 secondary action. `sm` 폐기하거나 정의를 `min-h-44`로 강제하는 게 일괄 해결.
2. **TYPO.caption (12px) 의 과사용** — 보조 정보 토큰인데 본문에도 사용. 사용처 audit + body 로 격상 권고가 토큰 자체 변경보다 영향 적음.
3. **모달/시트 안의 컨트롤은 `min-h-[36px]` 패턴** ([MobileHistoryScreen.tsx:431], SheetHeader X) — 모달이라고 작아져도 된다는 가정. 사실 모달 안에서도 44px 필수.

---

## 가장 시급한 5가지 (실행 우선순위)

1. **A1 + A2 + A5 + B2 — primitives 일괄 44px 화** (한 PR로 묶음). 영향 범위 가장 큼.
2. **H1 — sticky 헤더 → fixed** (실기기 테스트 필요). 입출고 위저드는 핵심 흐름.
3. **C1 — color-mix 메시지 대비** (WCAG AA 확인). 에러 메시지가 안 보이면 운영 사고.
4. **E1 + E2 — 입력 키보드 최적화** (검색·숫자 input 전수). 적은 코드로 큰 UX 개선.
5. **D1 — span[role=button] → button** (1곳). 접근성 + 코드 단순화.

---

## 명시적 비범위 (재확인)

- 권한별 화면 (이필욱 단일 계정 기준)
- iOS Safari 실기기 — `100dvh`, 키보드 가림, safe-area 정확 검증
- 다크 모드 색 대비 — 모바일에 다크 토글 없음
- Figma 시안 — 텍스트 감사만
- 실제 구현 PR — 본 보고는 감사만, 수정은 [docs/mobile-improvement-plan.md](docs/mobile-improvement-plan.md) (작성 예정)
