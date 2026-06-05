# DEXCOWIN MES — 모바일 디자인 시스템 가이드

> 모바일 쉘([frontend/app/legacy/_components/mobile/](frontend/app/legacy/_components/mobile/))의 토큰·primitives·체크리스트를 정리한 단일 참조 문서.
> 신규 컴포넌트 추가 / 기존 컴포넌트 수정 시 본 문서를 따른다.

## 1. 토큰

### 1.1 색상 (`LEGACY_COLORS`)

위치: [frontend/lib/mes/color.ts](frontend/lib/mes/color.ts)
구현: CSS 변수 (`--c-*`) — [globals.css:11-91](frontend/app/globals.css#L11-L91) 에서 라이트/다크 자동 전환

| 키 | 라이트 | 다크 | 용도 |
|----|----|----|----|
| `bg` | 페이지 배경 | 페이지 배경 | 화면 최외곽 |
| `s1`·`s2`·`s3`·`s4` | 카드·시트·패널 톤 | 〃 | 깊이 단계별 surface |
| `border`·`borderStrong` | 약/강 테두리 | 〃 | divider·강조 |
| `text` | 본문 텍스트 | 본문 텍스트 | 항상 최대 대비 |
| `muted`·`muted2` | 보조 텍스트 2단계 | 〃 | 메타·라벨 |
| `blue`·`green`·`red`·`yellow`·`purple`·`cyan` | 의미 색 6종 | 〃 | 강조·상태 |
| `successBg`·`errorBg`·`warningBg` | `#e6f7f2`·`#fdeaea`·`#fef6e4` | `#0a2420`·`#2b0d0d`·`#261d00` | 메시지 박스 배경 (4.5:1 보장) |
| `panelGlow` | radial gradient | radial gradient | 카드 우상단 하이라이트 |
| `white` | 항상 #ffffff | 항상 #ffffff | 강조 텍스트·배지 |

#### 사용 규칙

- **인라인 색상 금지** — `style={{ background: '#xxx' }}` 직접 작성 X. 항상 `LEGACY_COLORS.xxx` 또는 CSS 변수 `var(--c-xxx)`.
  - ⚠️ **현실 괴리**: 레거시·일부 의도적 rgba 오버레이/딤에 인라인 색이 다수 남아 있다. **신규 코드는 토큰만** 쓰고, 레거시는 인접 작업 시에만 점진 정리한다(일괄 변경 금지). 위반 건수는 변동값이라 박지 않는다 — 필요하면 직접 grep.
- **새 색 추가 절차**: 1) color.ts 에 키 추가 → 2) globals.css 라이트·다크 두 블록 모두에 변수 정의 → 3) WCAG AA 4.5:1 대비 수계산 또는 [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) 확인 → 4) 본 문서 표 갱신
- **합성 색 (color-mix) 지양** — 부모 배경에 따라 대비가 달라짐. 메시지 배경처럼 가독성이 중요하면 불투명 토큰 추가.

#### 부서·옵션 색

별도 enum:
- `MES_DEPARTMENT_COLORS` — 부서별 고정 색 (튜브·고압·진공·튜닝·조립·출하·고품질·연구 등)
- `OPTION_COLOR` — BG/WM/SV 의 옵션 색 (#60a5fa·#f97316·#a3a3a3)

### 1.2 타이포 (`TYPO`)

위치: [frontend/app/legacy/_components/mobile/tokens.ts](frontend/app/legacy/_components/mobile/tokens.ts)
폰트: **Pretendard**(2026-06-05부터 `next/font/local`로 self-host 실로딩) → Noto Sans KR → system-ui 폴백.
폰트 스택은 `var(--font-pretendard)` CSS 변수로 주입된다 ([app/layout.tsx](frontend/app/layout.tsx), [globals.css](frontend/app/globals.css), [tailwind.config.ts:31](frontend/tailwind.config.ts#L31)). *(그 이전엔 이름만 선언돼 있고 폰트 파일이 없어 시스템 폰트로 폴백됐었다.)*

| 토큰 | 클래스 | 픽셀 | 권장 사용 |
|----|----|----|----|
| `display` | `text-2xl font-black` | 24 | KPI 큰 숫자, 화면 헤드라인 |
| `headline` | `text-lg font-black leading-tight` | 18 | 페이지/섹션 제목 |
| `title` | `text-base font-bold` | 16 | 카드 제목, 시트 제목 |
| `body` | `text-sm font-medium` | 14 | **본문 텍스트의 기본값** |
| `caption` | `text-xs font-regular` | 12 | 메타정보·날짜·라벨 (보조 정보만) |
| `overline` | `text-xs font-bold uppercase tracking-wider` | 12 | 섹션 라벨·카테고리 헤더 |

> **적용 범위 — 모바일 전용**: TYPO 토큰은 **모바일 primitives에서만** 채택돼 있다. 데스크탑은 raw Tailwind 타이포 클래스를 직접 쓰므로(이웃 패턴을 따른다), 데스크탑 작업에는 이 절(TYPO 사용 규칙)을 적용하지 않는다 — 억지로 토큰화하면 그 화면만 튄다.

#### 사용 규칙

- **본문에는 `body`** — caption(12px) 을 본문에 쓰지 말 것. 모바일 권장 본문 14px 이상.
- **`text-[10px]`, `text-[11px]` 금지** — 배지처럼 어쩔 수 없는 경우만 `text-[11px]`. 본문·라벨은 모두 12px 이상.
  - ⚠️ **현실 괴리**: 레거시 배지·헤더에 `text-[10px]`/`text-[11px]`가 다수 남아 있다(정당화 주석 없는 경우 포함). **신규 코드만 엄수**하고, 레거시는 점진 정리한다.
- **굵기 혼합 자제** — 한 카드 안에 굵기 3종 이상 사용 X. 보통 2종(`font-bold` + `font-medium`) 으로 충분.
- 위계가 역전되는 곳(부제가 제목보다 크게 보임) 발견 시 즉시 토큰 격상.

### 1.3 간격·고도(ELEVATION)

- 카드 그림자: [tokens.ts:11](frontend/app/legacy/_components/mobile/tokens.ts#L11) `ELEVATION.sticky = "0 2px 8px rgba(0,0,0,0.12)"`
- 간격: Tailwind 기본값 따름 (`gap-1.5`, `gap-2`, `p-3`, `py-2.5` 등). 커스텀 spacing 미정의.
- BottomSheet safe-area: `calc(env(safe-area-inset-bottom, 16px) + 20px)` 패턴 — [BottomSheet.tsx](frontend/lib/ui/BottomSheet.tsx) 에 이미 적용

### 1.4 아이콘

라이브러리: `lucide-react`
권장 크기 4단계:

| 크기 | 사용처 |
|----|----|
| 16 | 인라인 (텍스트와 같이 흐름 안에) |
| 20 | 액션 버튼 (탭바·툴바·일반 버튼) |
| 24 | 헤딩·강조 (BottomSheet 헤더, 빈 상태 일러스트) |
| 28+ | 피처·온보딩 |

`IconButton` SIZE 표가 이 4단계의 기준점:
- `sm`: box `h-11 w-11` (44px hit area), icon 16
- `md`: box `h-11 w-11`, icon 20
- `lg`: box `h-12 w-12`, icon 22

## 2. Primitives 카탈로그

위치: [frontend/app/legacy/_components/mobile/primitives/](frontend/app/legacy/_components/mobile/primitives/)

| 컴포넌트 | 용도 | 비고 |
|----|----|----|
| `IconButton` | 아이콘 단독 버튼 (헤더·툴바·시트 닫기) | sm·md·lg, ghost·solid·outline 변형 |
| `PrimaryActionButton` | 화면당 1개 주요 액션 (제출·확인) | 풀폭, 색 강조 |
| `Stepper` | 숫자 ± 조정 | ± 버튼 44px hit area, input `inputMode="numeric"` |
| `KpiCard` | 대시보드 카드 (제목·숫자·서브정보) | TYPO.display + caption |
| `StatusBadge` | 상태 표시 (정상·부족·품절·불량) | `MesTone` 매핑 |
| `SegmentedControl` | 2-4 옵션 탭 선택 | 배지 `text-[11px]` |
| `FilterChip` | on/off 토글 칩 | caption + 클릭 영역 44 |
| `SummaryChipBar` | 활성 필터 표시 + X 제거 | 제거 버튼 `<button>` 시맨틱 |
| `InlineSearch` | 검색 input + 지우기 | `inputMode="search"` `enterKeyHint="search"` |
| `PinInput` | 4자리 PIN 입력 | `inputMode="numeric"` |
| `SubScreenHeader` | 드릴다운 페이지 헤더 (← + 제목 + right slot) | 좌측 뒤로 + 우측 슬롯 |
| `SheetHeader` | BottomSheet 헤더 (제목 + X) | X 는 IconButton sm |
| `StickyFooter` | 화면 하단 고정 액션 영역 | safe-area-inset-bottom 처리 |
| `BottomSheet` (공용) | 풀스크린 모달 | [frontend/lib/ui/BottomSheet.tsx](frontend/lib/ui/BottomSheet.tsx) |
| `SectionCard` | 섹션 카드 (제목·부제·본문) | 제목 `TYPO.title` |
| `QuickActionGrid` | 그리드 아이콘 액션 묶음 | 모바일 admin 허브 |
| `ErrorAlert` | 인라인 에러 메시지 | `errorBg` 토큰 + 본문 TYPO.body |
| `PersonAvatar` | 사용자 아바타 (이름 첫 글자) | 이름 라벨 TYPO.body |
| `MobileUserMenuSheet` | 사용자 시트 (프로필·PIN·로그아웃) | MobileShell 헤더에서 호출 |

> 위 표는 **주요 primitives만** 추린 것이다. 보조 컴포넌트(`SectionHeader`·`AsyncState`·`EmptyState`·`ItemRow`·`MoreMenuRow`·`WizardHeader`·`WizardProgress` 등)를 포함한 **현재 전체 구성은 [primitives/ 폴더](frontend/app/legacy/_components/mobile/primitives/) 기준**으로 본다. 개수는 변동값이라 박지 않는다.

### 데스크탑↔모바일 공유

- `lib/ui/` — 데스크탑·모바일 공용 (예: `BottomSheet`·`ConfirmModal`·`Toast`·`TruncatedText`·`Tooltip`·`Button`·`ImageLightbox`·`dirty-guard`). 현재 목록은 [lib/ui/ 폴더](frontend/lib/ui/) 기준
- 모바일 primitives 는 대부분 데스크탑에서 직접 호출되지 않음 (모바일 전용)
- 예외: `IconButton sm` 이 데스크탑 [DesktopRightPanel](frontend/app/legacy/_components/DesktopRightPanel.tsx) 등에서 호출될 수 있음 — 변경 시 데스크탑 시각 영향 확인 필수

## 3. 모바일 컴포넌트 체크리스트

신규 컴포넌트 추가 시 5분 셀프 점검:

- [ ] **클릭 가능 요소 hit area ≥ 44×44px**
  - 시각 영역은 작아도 됨 (예: X 아이콘 18px). hit area 만 44.
  - `min-h-[44px] min-w-[44px]` 또는 negative margin 패턴
- [ ] **본문 텍스트 ≥ 14px** (TYPO.body 또는 그 이상)
- [ ] **배지·메타 텍스트 ≥ 12px** (TYPO.caption). `text-[10px]`·`text-[11px]` 사용 시 정당화 사유 주석
- [ ] **`<button>` 시맨틱** — span/div + onClick 금지. role="button" 도 가급적 피하고 button 사용
- [ ] **input 속성** — `inputMode`·`autoComplete`·`enterKeyHint`. 숫자 input 은 `inputMode="numeric"`, 검색은 `"search"`
- [ ] **iOS 자동 줌 방지** — input `font-size ≥ 16px`. globals.css 의 모바일 미디어 쿼리가 이를 강제하지만 인라인 스타일로 override 시 주의
- [ ] **safe-area** — 화면 하단 고정 요소는 `paddingBottom: env(safe-area-inset-bottom)` 또는 `StickyFooter` 사용
- [ ] **호버 의존 금지** — `hover:` 클래스로만 정보 노출 X. `title` 속성 X (모바일에서 안 보임)
- [ ] **aria-label** — 아이콘 버튼·시각만 있는 컨트롤
- [ ] **focus 표시** — focus-visible 스타일 (기본 브라우저 outline 제거하지 말기)
- [ ] **데스크탑 분기 확인** — `frontend/app/legacy/page.tsx:27-39` 의 `lg:hidden` / `hidden lg:flex` 분기를 깨지 않도록

## 4. 변경 이력

- **2026-06-05**: Pretendard `next/font/local` self-host 실로딩 전환 반영(이전엔 선언만·미로드). 카탈로그 개수 하드코딩 제거(폴더 기준 안내로 전환), 인라인색·`text-[10/11px]` 규칙에 현실 괴리 주석, TYPO 모바일 전용 범위 명시.
- **2026-05-27 W3**: `successBg`·`errorBg`·`warningBg` 토큰 신설 — 메시지 박스 가독성
- **2026-05-27 W6**: globals.css 에 iOS 자동 줌 방지 미디어 쿼리 — `input/textarea/select` 16px 강제
- **2026-05-27 W6**: `TYPO.caption` 사용처 audit — ErrorAlert·PersonAvatar 본문 격상, 나머지 24개 보조정보 유지
- **2026-05-27 W4**: primitives sm 사이즈 44px hit area 정합화 (IconButton·Stepper·SummaryChipBar)
- **2026-05-27 W4**: SectionCard 위계 역전 해소 — 제목 TYPO.title
- **2026-05-27 W4**: SummaryChipBar 의 span[role=button] → `<button>` 시맨틱
- **2026-05-27 W1**: MobileUserMenuSheet 신규 — 사용자명·PIN·로그아웃 시트

## 5. 보류·향후 작업

- Android 하드웨어 백버튼 처리 — PWA/Capacitor 전환 시점에 `useEffect` + `popstate`
- 다크 모드 토글 — 모바일에 토글 자체가 없음. data-theme 자동 OS 따라가도록 globals.css 정의됨
- Figma 시안 — 본 텍스트 가이드만으로 신규 컴포넌트 가이드 가능. 시안은 별도 사이클
- 스토리북 — primitives 카탈로그를 시각화. 현재는 본 문서가 대체
- WCAG AAA 대비 — 현재 AA 4.5:1 기준. AAA 7:1 은 별도

> **변동 수치는 문서에 박지 않는다** — primitives 개수·규칙 위반 건수 등은 시간이 지나면 낡는다. 살아있는 폴더/코드를 직접 세거나, 백엔드 도메인 수치(품목·공정·모델 수 등)는 `python _attic/backend-scripts/facts.py`로 확인한다 (CLAUDE.md 규칙).

## 참고 문서

- [docs/mobile-improvement-plan.md](docs/mobile-improvement-plan.md) — 본 시스템을 만든 통합 plan
- [docs/mobile-design-audit.md](docs/mobile-design-audit.md) — 사전 감사 보고서 (26 결함)
- [docs/mobile-feature-parity.md](docs/mobile-feature-parity.md) — 데스크탑 대비 기능 결함 정리
- [docs/mobile-improvement-execution.md](docs/mobile-improvement-execution.md) — 6 워커 실행 결과
- [CLAUDE.md](CLAUDE.md) — 프로젝트 전체 규칙 (커밋 메시지·동결 정책)
