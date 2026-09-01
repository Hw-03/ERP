# DEXCOWIN MES — 실측 디자인 언어

> 이 문서는 2026-06-04 **실제 프론트엔드 코드를 검수해 측정한** "지금 진짜 모습"이다.
> `_attic/docs/mobile-design-system.md`는 *의도와 규칙*을 적은 문서지만, 의도와 현실이 갈리는 지점이 있다.
> 신규/수정 작업은 여기 적힌 **실측 시그니처**에 맞춘다. 의도≠현실 지점은 ⚠️로 표시했다 — 따라 하지 말 것.

## 색

- 색은 전적으로 **`LEGACY_COLORS` (= `var(--c-*)` CSS 변수)** 기반. ([frontend/lib/mes/color.ts](frontend/lib/mes/color.ts), [globals.css](frontend/app/globals.css))
- ⚠️ tailwind `brand-*` 팔레트(`tailwind.config.ts`)는 정의돼 있으나 **실사용 0곳** — 죽은 코드다. `brand-500` 같은 클래스 쓰지 말 것.
- **라이트 모드 우선** 설계. 실제 핵심값(라이트):
  - 배경 `--c-bg` `#eff4fb` (밝은 청회색)
  - 카드 표면 `s1~s4` = 반투명 화이트(92~98% 불투명)
  - 강조: blue `#2f74e7` · green `#179f72` · red `#d95a5a` · yellow `#b98619` · purple `#6f59e8` · cyan `#078db0`
  - 텍스트 `#101a2b` · muted `#72829a` · muted2 `#56657e`
  - 메시지 배경 successBg/errorBg/warningBg (불투명 — 대비 보장)
- **다크 모드**: 같은 토큰을 `:root[data-theme="dark"]`에서 전부 재정의(배경 `#07101d` 계열). **토큰만 쓰면 라이트/다크 자동 대응** — 이게 인라인 색을 피해야 하는 진짜 이유.
- 동적 강조는 `color-mix(in srgb, {tone} X%, transparent)`: **배경 8~22%, 보더 30~50%** tint가 실제 패턴.
- ⚠️ "인라인 색 금지"는 규칙이지만 현실은 **54개 파일에서 위반**(대부분 `_archive` 레거시 + 일부 의도적 rgba 오버레이/딤). **신규 코드는 토큰만** 쓴다. 신규 영역 `features/mes/`는 ESLint(`no-restricted-syntax`)로 인라인 hex·div/span+onClick·정보성 title=을 자동 차단한다(2026-06-05~). 레거시는 게이트로 막지 않고 점진 정리.

## 타이포

- **Pretendard는 `next/font/local`로 self-host 로드된다**(2026-06-05~). `app/fonts/PretendardVariable.woff2`(변수폰트 45~920, `font-black`까지 커버) + `--font-pretendard` CSS 변수, 폴백 Noto Sans KR → system-ui. *(이전엔 선언만 있고 미로드 → 시스템 폰트로 폴백됐었음.)*
- `TYPO` 토큰([mobile/tokens.ts](frontend/app/legacy/_components/mobile/tokens.ts)): display(24)/headline(18)/title(16)/body(14)/caption(12)/overline(12). 문서와 정확히 일치.
- ⚠️ TYPO 토큰 채택은 **모바일만 100%, 데스크탑은 0%**(raw Tailwind 직접 사용). 전체 raw 타이포 클래스 ~618회 vs TYPO 55회.
- 실측 주류 조합: `text-xs font-bold`(라벨·배지·헤더, 최다) / `text-sm font-medium`(본문) / `text-lg`~`text-2xl font-black`(제목·KPI).
- ⚠️ `text-[10px]`/`text-[11px]` 금지 규칙 대비 실제 **246회** 사용(배지 ~30%, 나머지는 정당화 주석 없음).

## 형태 시그니처 — 이게 "우리 느낌"의 핵심 (실측)

- **카드**: `rounded-[20px]` + 1px border(`--c-border` ≈ `rgba(76,97,130,.1)`) + 부드럽고 넓은 그림자 `var(--c-card-shadow)` = `0 24px 64px rgba(45,70,106,.12)`
- **둥근 정도**(요소별): 버튼 `rounded-[12~16px]` · 배지/칩 `rounded-full`(+ 색 14% tint) · 모달 `rounded-[24px]` · 하단시트 `rounded-t-[22px]` · 우측패널 `rounded-[32px]`
- **누름/호버**: 누르면 `active:scale-[0.98]`~`95`, 호버는 `brightness-110`. 전환 `transition` 150ms, easing `cubic-bezier(.4,0,.2,1)` (하단시트만 `.32,1.2,.6,1` 살짝 오버슈트)
- **진입 모션**: 하단시트 `translateY(60px)→0` + 페이드 / 우측 슬라이드패널 width 160ms + content 260ms 이중 전환
- **간격 리듬**: 요소 간 `gap-2` 기본 · 섹션 간 `gap-3~4` · 카드 패딩 `px-4 py-3`(표준), 큰 패널 `p-5`
- **아이콘**: `lucide-react` 16/20/24 · 터치 영역 `h-11 w-11`(44px)
- **레이아웃(데스크탑)**: 좌 사이드바 + 중앙 본문(`rounded-[28px]`) + 우측 패널(`rounded-[32px]`, 436px 슬라이드인). `lg:` 분기로 모바일 = 풀스크린 + 바텀시트
- **정체성 한 줄**: *미니멀하되 따뜻하고, 모듈이 둥글게 독립적이면서 전체가 한 톤.*

## Primitives — 실측 (문서 카탈로그보다 최신)

- 모바일 `primitives/` 실제 **25개**. 문서의 "18 + 보조 6"은 낡음. 보조로 묶인 실제 7개: `SectionHeader` · `AsyncState` · `EmptyState` · `ItemRow` · `MoreMenuRow` · `WizardHeader` · `WizardProgress`.
- 공용 `lib/ui/` 실제 **7개**: BottomSheet · ConfirmModal · TruncatedText · Tooltip · Button · ImageLightbox · dirty-guard.
- 짧은 성공·오류·정보 알림은 `common/StatusTargetNotice` 단일 소스를 데스크톱·모바일에서 공유한다.
- ⚠️ **모바일↔데스크탑 중복**(이름/구현 다름 — 신규 작업 시 어느 화면인지 보고 맞는 쪽 사용):
  - `KpiCard`: 모바일(`primitives/`, color 기반) vs 데스크탑(`common/`, tone-tint 기반)
  - `FilterChip`: 모바일(직접 button) vs 데스크탑(`common/`, Button 래퍼)
  - `EmptyState`: **통합 완료(2026-06-05)** — 모바일 전용은 미사용이라 제거, `common/EmptyState` 단일 소스. (KpiCard·FilterChip·StatusBadge는 의도적 분리로 유지, 파일 상단 주석 명시)
  - `StatusBadge`(모바일) ↔ `StatusPill`(데스크탑) — 이름부터 다름
- 데스크탑 사실상 primitive: `common/`(KpiCard·FilterChip·StatusPill·EmptyState·LoadingSkeleton·LoadFailureCard·ResultModal·SlidePanel), `_admin_sections/_admin_primitives/`(AdminPageHeader·AdminKpiBar·AdminDetailCard·AdminListPanel).

## 작업 시 함정 (검수로 드러난 실제 위험)

- **데스크탑엔 TYPO 토큰이 없다** — 데스크탑 작업 땐 이웃 raw 클래스 패턴을 따른다. 억지로 토큰화하지 말 것(그 화면만 튐).
- **같은 이름 컴포넌트가 모바일/데스크탑에 따로** 있으니 import 경로를 반드시 확인.
- **focus 처리** — 일부 input이 `outline-none`만 두고 대체 포커스 스타일이 없다. 신규엔 `focus-visible:ring`/`focus-visible:border`를 함께.
- **동결 영역**(주간보고 화면 등 CLAUDE.md 명시)은 디자인 작업에서도 건드리지 않는다.
