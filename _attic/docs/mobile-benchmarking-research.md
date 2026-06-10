# DEXCOWIN MES 모바일 UI 벤치마킹 리서치

> **작성일** 2026-06-10
> **연구 방식** deep-research 워크플로 (fan-out 웹검색 + 3-vote 적대적 교차검증 + 종합)
> **규모** 6개 검색 각도 · 25개 소스 fetch · 102개 클레임 추출 → 25개 검증 → **23개 확정 · 2개 반증** · 108개 에이전트 호출
> **상태** 1차 종합 완료. 구현 권고는 별도 플랜에서 다룸 — 본 문서는 *근거 자료*다.

---

## 연구 질문 (전문)

> DEXCOWIN MES — 정밀 X-Ray 제조 현장용 생산관리시스템(Next.js 14 + Tailwind 웹앱)의 **휴대폰용 웹/PWA 모바일 UI를 개선**하기 위한 벤치마킹 리서치.
>
> **조사 초점 두 축** — (1) 화면 흐름·네비게이션 패턴: 제조/창고(WMS)/물류/현장작업(field service) 모바일 앱의 검증된 네비게이션 구조, 데이터 입력 플로우(위저드 vs 단일 폼 vs 인라인), 바코드/QR 스캔 동선, 빠른 작업, 한 손 조작·엄지존·글랜서빌리티. (2) 시각/룩앤필: 산업용 모바일 앱의 색·여백·카드·타이포·정보 밀도 컨벤션, 밝은 조명·장갑 착용 환경의 가독성·대비·터치 타깃.
>
> **제약** — 웹/PWA 유지가 전제. 네이티브 전환은 범위 밖.

**사용자 사전 합의 (스코프 조정)**
- 벤치마킹 초점: **화면 흐름·네비게이션 + 시각/룩앤필** (특정 앱 이름은 패턴의 근거로만)
- 주 사용 기기: **휴대폰** (현재 393px 폰 설계 유지)
- 플랫폼: **웹/PWA 유지** (네이티브 전환 검토 제외)

---

## 초록 (Abstract)

본 연구는 DEXCOWIN MES의 휴대폰 웹/PWA 모바일 UI를 개선하기 위해, 제조·창고·물류·필드서비스 도메인의 검증된 모바일 UX 패턴과 엔터프라이즈 디자인 시스템 표준을 6개 각도로 교차 조사했다.

**핵심 결론: 현재 구현 방향은 검증된 산업 표준과 대체로 일치한다.** 하단 탭바, 44px 터치 타깃, 카드 기반 색상 코드, 라이트 우선 고대비, 8px 간격 그리드, 복잡 입력의 멀티스텝 위저드, iOS 스캔 WASM 폴백 — 이 모든 결정이 1차 출처(NN/g, WCAG 2.2, IBM Carbon, Material, Microsoft Dynamics 365 Field Service, Scandit)로 뒷받침된다.

**새로 채택할 가치가 큰 개선은 3가지로 수렴한다.** ① 하단 탭 수 축소(탭 최소화 원칙 대비 현재 6탭), ② 스캔-우선(scan-first) 워크플로 도입(스캔을 입력 동선의 진입점으로), ③ 위저드 적용 경계 재검토(단순·반복 입력은 인라인이 더 빠름).

또한 교차검증 과정에서 두 개의 흔한 통념이 **반증**됐다 — "사용자는 카메라 프리뷰를 안 보고 스캔한다", "역할별 맞춤 워크플로가 단계를 줄인다" — 둘 다 다수결 반박으로 기각되어, 설계 시 따라가지 말아야 할 안티패턴으로 기록한다.

---

## 1. 배경 · 현황 (Baseline)

벤치마킹은 "우리 현재 모습"을 정확히 알아야 의미가 있다. 본 절은 조사 시작 시점(2026-06-10)의 DEXCOWIN MES 모바일 구현을 코드 실측으로 정리한다.

### 1.1 현재 모바일 아키텍처

| 항목 | 구현 | 위치 |
|------|------|------|
| 분기 전략 | `lg:hidden`으로 데스크톱과 완전 분리 (반응형이 아닌 별도 컴포넌트 트리) | `frontend/app/mes/page.tsx` |
| 셸 | 하단 **6탭 탭바** + 헤더(로고·알림벨·아바타) | `frontend/app/mes/_components/mobile/MobileShell.tsx` |
| 탭 구성 | 대시보드 · 입출고 · 불량 · 내역 · 주간보고 · 관리 (입출고·불량은 `canEnterIO` 권한 게이트) | `MobileShell.tsx:33-40, 120-127` |
| 상세 표시 | BottomSheet (drag-to-dismiss, 96px/0.5px·ms 임계값, focus trap) | `frontend/lib/ui/BottomSheet.tsx` |
| 입력 동선 | 입출고 = **풀스크린 5단계 위저드**(작업유형→세부유형→대상선택→실반영→제출) | `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx` |
| 리스트 | 내역 = 테이블→카드 리스트 전환 | `frontend/app/mes/_components/mobile/history/MobileHistoryList.tsx` |
| 스캔 | QR/바코드 모달 (native `BarcodeDetector` 우선 + **ZXing 폴백**) | `frontend/app/mes/_components/BarcodeScannerModal.tsx`, `_hooks/useBarcodeScanner.ts` |
| 프리미티브 | 모바일 전용 ~23개 (KpiCard·StatusBadge·Stepper·PinInput·SegmentedControl 등) | `frontend/app/mes/_components/mobile/primitives/` |

### 1.2 현재 디자인 언어 (토큰 실측)

- **색**: 전적으로 `LEGACY_COLORS`(= `var(--c-*)` CSS 변수) 기반. 라이트 우선 + 다크 자동 전환. 강조 blue `#2f74e7`·green·red·yellow·purple·cyan. (`frontend/lib/mes/color.ts`)
- **타이포**: `TYPO` 토큰 — display(24)/headline(18)/title(16)/body(14)/caption(12)/overline(12). Pretendard self-host. (`frontend/app/mes/_components/mobile/tokens.ts`)
- **형태**: `rounded-[20px]` 카드 + 넓고 부드러운 그림자, `active:scale-[0.92~0.98]` 누름 피드백, lucide-react 아이콘 16/20/24, **44px(h-11 w-11) 터치 영역**, `gap-2`(요소)/`gap-3~4`(섹션) 간격 리듬.

### 1.3 약한 곳 (벤치마킹이 도움 될 지점)

- **주간보고** 탭: 모바일 미최적 — 현재 데스크톱 뷰 패스스루.
- **창고지도**: 모바일 버전 없음.
- **PWA 기능**: 홈화면 추가·오프라인 캐시·푸시 미구현(다크모드 토글도 모바일엔 없음 — OS 따라감).

---

## 2. 연구 방법론 (Methodology)

### 2.1 조사 구조

본 연구는 단일 검색이 아니라 **fan-out + 적대적 교차검증** 파이프라인으로 수행됐다.

1. **Scope** — 연구 질문을 6개의 상보적 검색 각도로 분해.
2. **Search** — 각 각도마다 독립 웹검색 에이전트 1개(총 6개)가 병렬 탐색.
3. **Fetch** — URL 중복 제거 후 상위 25개 소스를 fetch, 각 소스에서 *반증 가능한(falsifiable)* 클레임을 추출(총 102개).
4. **Verify** — 클레임마다 **3명의 독립 검증관**이 적대적으로 반박 시도. **3표 중 2표 이상 반박**되면 클레임 폐기(kill).
5. **Synthesize** — 살아남은 클레임을 의미 단위로 병합, 신뢰도순 정렬, 출처 인용.

3-vote 교차검증은 "그럴듯하지만 틀린" 주장이 살아남는 것을 막기 위한 장치다. 그 대가로 에이전트 수가 폭증한다(검증에만 ~75개+).

### 2.2 6개 검색 각도

| # | 각도 | 검색 의도 |
|---|------|----------|
| 1 | broad/primary — 현장 모바일 네비게이션 | 하단 탭바와 대안, 산업 현장 앱의 화면 흐름 모범 사례 |
| 2 | practitioner — 데이터 입력 & 스캔-우선 | 위저드 vs 단일 폼/인라인, 스캔 우선 워크플로의 실무 트레이드오프 |
| 3 | ergonomics — 한손·엄지존·장갑 환경 | 엄지존·글랜서빌리티 원칙 + 밝은 조명·장갑 제약 |
| 4 | visual/design-system — 엔터프라이즈 룩앤필 | Material·Carbon·Polaris의 색·여백·카드·타이포·정보밀도 컨벤션 |
| 5 | PWA-specific — 오프라인·웹 카메라 한계 | 홈화면 추가·오프라인·BarcodeDetector 한계와 우회책 |
| 6 | case studies — 실존 물류/MES/필드서비스 앱 | 실제 앱 UI 티어다운으로 패턴에 구체 레퍼런스 부여 |

### 2.3 통계

| 지표 | 값 |
|------|-----|
| 검색 각도 | 6 |
| fetch한 소스 | 25 |
| 추출 클레임 | 102 |
| 검증된 클레임 | 25 |
| **확정(confirmed)** | **23** |
| **반증(killed)** | **2** |
| 종합 후 발견(findings) | 4 (23개 확정 클레임의 의미 병합 결과) |
| URL 중복 제거 | 4 |
| 예산상 드롭된 클레임 | 7 |
| 총 에이전트 호출 | 108 |

### 2.4 소스 신뢰도 등급 기준

- **primary** — 표준/공식 디자인 시스템/1차 권위 출처 (NN/g, WCAG, Carbon, Material, Microsoft 공식, Scandit, Rossul 사례). 본 연구 결론의 핵심 근거.
- **secondary** — 기술 레퍼런스/집계 (caniuse, Strich KB, UXPin).
- **blog** — 실무 블로그. 단독으로는 약하므로 **표준 문서로 교차보강**한 경우에만 채택.
- **unreliable** — 클레임 추출 0건 또는 신뢰 불가. **본 연구에서 인용하지 않음** (예: fastercapital, m3 density 페이지, SAP Fiori iOS 페이지 — fetch는 됐으나 유효 클레임 미산출).

---

## 3. 연구 결과 (Findings, 각도별)

각 절은 **핵심 발견 → 근거 출처 → 신뢰도 → 우리 앱 매핑(충족/갭)** 순으로 정리한다. 신뢰도는 워크플로가 부여한 값이다.

### 3.1 네비게이션 패턴 — 하단 탭바, 탭 최소화, 엄지존 1차 액션

**핵심 발견** *(신뢰도: high)*
현장 모바일 앱의 검증된 네비게이션은 **하단 탭바**를 기본으로 하되 **탭 수를 최소화**하고, **1차 액션을 화면 하단(엄지 도달권)**에 배치하며, 항목은 **카드 + 색상 코드**로, **고대비 + 44px 터치 타깃**, **2/4/8px 간격 리듬**으로 구성한다.

**근거** — Microsoft Dynamics 365 Field Service 모바일 UX 리디자인(primary, 2023): 기술자용 모바일을 하단 네비게이션·우선순위화된 액션·카드 기반·글랜서블 레이아웃으로 개편. IBM Carbon Spacing(primary)이 2/4/8px 간격 토큰(spacing-01=2px, -02=4px, -03=8px)을 규정.

**우리 앱 매핑**
- ✅ **충족**: 하단 탭바(`MobileShell.tsx`), 엄지존 하단 PrimaryActionButton, 부서색 카드, 라이트 우선 고대비, 44px, `gap-2/4` 리듬.
- ⚠️ **갭**: 현재 **6탭**. "탭 최소화" 권고(통상 4~5개)와 충돌. 주간보고·관리는 현장 휴대 빈도가 낮으니 하단탭에서 분리 검토(→ §4, §7).

### 3.2 데이터 입력 플로우 — 복잡=위저드, 반복=인라인

**핵심 발견** *(신뢰도: high)*
입력 폼 설계는 **복잡도에 따라 분기**한다 — **복잡한 입력(다단계·조건부·많은 필드)은 멀티스텝 위저드**가 인지 부하를 낮추고 완료율을 높인다. 반면 **반복적·단순한 입력은 인라인/단일 폼**이 더 빠르다. 위저드의 손익분기는 대략 **6개 필드 이상**의 복잡도에서 정당화된다.

**근거** — lollypop.design 위저드 UI 가이드(blog) + weweb·ivyforms의 멀티스텝 vs 단일스텝 비교(blog), WCAG 2.2 target-size로 교차보강. *(블로그 출처이므로 신뢰도 한정 — 단, 세 출처가 일관된 결론.)*

**우리 앱 매핑**
- ✅ **충족**: 입출고 핵심 동선을 5단계 위저드로 구성(`MobileIoComposeWizard.tsx`) — 작업유형·BOM 전개 등 조건부 복잡도가 있어 위저드가 적절.
- ⚠️ **갭**: *단품 입고/출고(adjust_in/out)* 같은 단순·반복 케이스에 5단계는 과할 수 있음. 빠른 인라인 폼 분기 검토(→ §4).

### 3.3 스캔-우선(scan-first) 워크플로

**핵심 발견** *(신뢰도: high)*
바코드/QR 기반 현장 작업은 **스캔을 워크플로의 진입점**으로 두는 "scan-first" 설계가 효율적이다. **큰 스캔 트리거 버튼**, **다중 바코드 모달리티 지원**, 스캔 결과에 대한 **부드러운 피드백(soft alert, 성공/실패 시각·촉각 신호)**이 핵심 요소다.

**근거** — Scandit "Scanning at Scale: UX Insights"(primary). 대규모 스캔 운영의 UX 인사이트를 다룬 1차 자료.

**⚠️ 반증 주의 (§5 참조)** — "잘 설계된 스캔 플로우는 사용자가 **카메라 프리뷰를 안 보고도** 근거리 스캔하게 한다"는 Scandit의 부속 주장은 **교차검증에서 기각(2표 반박)**됐다. 즉 **조준 가이드/프리뷰는 여전히 필요**하다. 우리 스캔 프레임 오버레이 유지가 맞다.

**우리 앱 매핑**
- ✅ **충족**: QR/바코드 스캔 존재, 스캔 프레임 오버레이.
- ⚠️ **갭**: 스캔이 위저드 3단계(대상선택) 안에 묻혀 있음 — "scan-first"가 아님. 입출고/불량 화면 최상단에 **큰 "스캔으로 시작" 버튼**을 두고 스캔→품목 자동선택→수량만 입력으로 단축 검토(→ §4).

### 3.4 PWA · iOS 카메라/스캔 한계

**핵심 발견** *(신뢰도: high)*
웹/PWA 유지 전제에서 가장 큰 기술적 제약은 **iOS Safari**다. iOS는 **`BarcodeDetector` Web API를 지원하지 않으며**, PWA(홈화면 추가, standalone 모드)에서 **카메라 접근·권한 처리가 불안정**할 수 있다. 해결책은 **WebAssembly(WASM) 기반 스캐너**(Strich, Dynamsoft, ZXing-WASM 등)로 브라우저 API 부재를 메우는 것이다.

**근거** — Strich KB "Camera access issues in iOS PWA"(secondary), dev.to "Barcode scanning on iOS: the missing Web API and a WebAssembly solution"(blog), **caniuse `BarcodeDetector`**(secondary, 표준 지원 현황: Chrome/Android 계열 지원, Safari 미지원), magicbell PWA iOS 한계 가이드(blog).

**우리 앱 매핑**
- ✅ **충족**: `useBarcodeScanner.ts`가 native `BarcodeDetector` 우선 + **ZXing 폴백** 구조 — iOS에서 폴백이 작동하도록 이미 대비됨. **이 설계가 본 연구로 검증됨.**
- ⚠️ **갭/확인 필요**: 실제 직원 iOS 비중과 iOS standalone PWA에서의 카메라 동작은 **실기기 검증 필요**(§6 한계).

### 3.5 인간공학 — 터치 타깃, 엄지존, 글랜서빌리티

**핵심 발견** *(신뢰도: high)*
- **터치 타깃**: NN/g는 충분한 터치 영역과 간격을 권고(약 1cm² ≈ 10mm). WCAG 2.2 신규 기준 **2.5.8 Target Size (Minimum) = 24×24 CSS px(AA)**, 구 2.5.5 Enhanced = 44×44px(AAA). 즉 **44px는 두 기준을 모두 초과 충족**.
- **엄지존(thumb zone)**: 한 손 조작 시 화면 하단·중앙이 "쉬움", 상단 모서리가 "어려움". 1차 액션·주 네비게이션은 하단에.
- **글랜서빌리티(glanceability)**: 전주의적(preattentive) 시각 처리를 활용 — 색·크기·위치로 핵심 정보를 *읽기 전에* 파악하게. 현장에서 흘끗 보고 판단하는 데 중요.

**근거** — NN/g "Touch Target Size"(primary), WCAG 2.2 Target Size Minimum(primary, W3C), parachutedesign 엄지존 UX(blog), design-bootcamp 글랜서블 인터페이스(blog).

**우리 앱 매핑**
- ✅ **충족**: 전 프리미티브 44px 강제, 하단 탭바·하단 1차 액션(엄지존), 부서색·KpiCard 색상 코드(글랜서빌리티).
- 추가 여지: 현장 밝은 조명 대비 — 라이트 모드 명도 대비 실측 점검(§7).

### 3.6 엔터프라이즈 디자인 시스템 컨벤션

**핵심 발견** *(신뢰도: primary)*
산업/엔터프라이즈 모바일의 시각 컨벤션은 공인 디자인 시스템에 성문화돼 있다 — **IBM Carbon**의 8px 기반 간격 토큰(타이트 영역 2/4px), **Material**의 데이터 테이블 밀도·행 높이 옵션(정보 밀도 조절). 정보 밀도가 높은 현장 데이터는 **밀도 단계(comfortable/compact)**를 의도적으로 선택해야 한다.

**근거** — IBM Carbon Spacing Overview(primary), Material Data Tables(primary). *(Material density 페이지(m3)는 유효 클레임 미산출 → 인용 제외.)*

**우리 앱 매핑**
- ✅ **충족**: 8px 그리드 리듬, TYPO 토큰 위계.
- 추가 여지: 내역/재고 같은 고밀도 리스트에 밀도 단계(여유/조밀) 개념 적용 검토.

---

## 4. 종합 권고 (Synthesis & Recommendations)

### 4.1 이미 잘 하고 있는 것 (연구가 검증)

| 패턴 | 우리 현황 | 1차 근거 |
|------|----------|----------|
| 하단 탭바 + 엄지존 1차 액션 | MobileShell 하단탭, 하단 PrimaryActionButton | Dynamics 365 Field Service |
| 44px 터치 타깃 | 전 프리미티브 44px | NN/g, WCAG 2.2 (24px AA / 44px AAA 초과) |
| 카드 색상코드 + 고대비 | 부서색 + 라이트 우선 WCAG AA | Dynamics 365, Carbon |
| 8px 간격 그리드 | gap-2/4 리듬 | Carbon Spacing |
| 복잡 입력 = 멀티스텝 위저드 | 입출고 5단계 위저드 | lollypop·weweb·ivyforms |
| iOS 스캔 WASM 폴백 | BarcodeDetector + **ZXing 폴백** | Strich·dev.to·caniuse |

### 4.2 채택할 가치가 큰 3대 개선

**① 하단 탭 수 축소 (6 → 4~5)**
- 근거: §3.1 "탭 최소화" 원칙. 권장 4~5탭 대비 현재 6탭.
- 방향: 현장 휴대 빈도가 낮은 **주간보고·관리**를 하단탭에서 빼고 헤더의 "더보기/메뉴"로 강등. 핵심 4탭(대시보드·입출고·불량·내역)만 엄지존 유지.
- 영향 파일: `MobileShell.tsx`(TAB_META·visibleTabs), 헤더 메뉴(`MobileUserMenuSheet.tsx` 인접).

**② 스캔-우선(scan-first) 동선 도입**
- 근거: §3.3 Scandit. 스캔을 입력 진입점으로, 큰 트리거.
- 방향: 입출고/불량 화면 최상단에 **큰 "스캔으로 시작" 버튼** → 스캔 → 품목 자동선택 → 수량만 입력. 단, **프리뷰/조준 가이드 유지**(§5 반증).
- 영향 파일: `MobileIoComposeWizard.tsx`, `BarcodeScannerModal.tsx`.

**③ 위저드 적용 경계 재검토**
- 근거: §3.2. 위저드는 6필드+ 복잡도에서 정당화, 단순·반복은 인라인.
- 방향: 단품 입고/출고(adjust_in/out) 등 단순 케이스에 빠른 인라인 폼 분기 추가 검토. 복잡 케이스(생산/분해/BOM 전개)는 위저드 유지.
- 영향 파일: `_warehouse_v2/ioWorkType.ts`, `MobileIoComposeWizard.tsx`.

---

## 5. 반증된 통념 (Refuted Claims — 따라가지 말 것)

교차검증에서 다수결(3표 중 2표 이상) 반박으로 **기각**된 주장. 그럴듯하지만 근거가 약해 설계 시 피해야 할 안티패턴이다.

| # | 반증된 주장 | 표결 | 출처 |
|---|------------|------|------|
| R1 | "글랜서빌리티가 화면 주시를 대체한다 — 잘 설계된 스캔 플로우는 사용자가 **카메라 프리뷰를 보지 않고** 근거리 스캔하며 휴대폰 화면 대신 실물 제품에 시선을 둔다." | 1-2 (반박 우세) | scandit.com/blog/scanning-at-scale-ux-insights |
| R2 | "역할별 맞춤 워크플로(예: 지게차 기사 vs 서비스 기술자)는 일반 산업 작업의 완료 단계 수를 줄인다." | 1-2 (반박 우세) | rossul.com/portfolio/warehouse-management-system |

**함의**
- R1 → 스캔 화면에서 **프리뷰·조준 오버레이를 제거하지 말 것**. 우리 현재 스캔 프레임 유지가 옳다.
- R2 → **역할별 분기 워크플로를 과설계하지 말 것**. 단계 축소 효과의 근거가 약하다.

---

## 6. 한계 · 신뢰성 (Limitations)

- **iOS PWA는 WebKit 버전에 따라 동작이 변동**한다(카메라·권한·standalone). caniuse·Strich는 "미지원/불안정"을 가리키지만, **실제 직원 iOS 기기에서의 실측이 필요**하다. 본 문서의 PWA 결론은 "WASM 폴백 필수"까지가 안전한 범위.
- **블로그 출처 비중**: §3.2 입력 플로우, §3.3 일부, §3.5 엄지존/글랜서빌리티의 일부 근거는 blog 등급이다. 각 결론은 1차 표준(WCAG·NN/g·Carbon·Material)으로 **교차보강한 범위에서만** 채택했다.
- **위저드 6필드 경계**는 출처들의 대략적 휴리스틱이며 엄밀한 컷오프가 아니다 — 우리 입력 케이스별로 직접 판단해야 한다.
- **예산상 드롭**: 추출된 102개 클레임 중 7개는 예산상 검증되지 못하고 제외됐다. 본 종합은 검증 완료된 25개(확정 23 + 반증 2) 기반이다.
- **`features/mes/` 신규 영역**과 우리 디자인 토큰의 외부 표준 대비 갭 분석은 본 연구 범위 밖이다(코드 검증 안 함).
- **종합 압축**: 23개 확정 클레임이 4개 발견(findings)으로 의미 병합됐다. 본 문서는 그 4개 발견 + 6개 각도 + 출처 등급을 전개한 것이며, 102개 원문 클레임 전체를 1:1로 보존하지는 않는다(워크플로 종합 단계의 설계상 특성).

---

## 7. 미해결 질문 (Open Questions)

워크플로가 후속 조사 대상으로 표시한 항목 + 본 매핑에서 도출된 확인 사항.

1. **6탭 분배** — 어떤 탭을 하단에 남기고 어떤 탭을 메뉴로 강등할지. 현장 사용 빈도 데이터 필요.
2. **iOS 사용 비중** — 직원 단말의 iOS:Android 비율. iOS가 유의미하면 §3.4 WASM 폴백 검증이 1순위.
3. **위저드 경계** — 어떤 입출고 케이스를 인라인으로 내릴지의 구체 기준.
4. **토큰 갭 분석** — 우리 디자인 토큰(색·간격·타이포)이 Carbon/Material 같은 외부 표준 대비 어디가 다른지의 정밀 비교(미수행).
5. **현장 밝은 조명 대비** — 라이트 모드 명도 대비를 실제 현장 조명에서 점검.

---

## 참고문헌 (References, 25)

> 등급: primary(1차/표준) · secondary(기술 레퍼런스) · blog(실무 블로그) · unreliable(유효 클레임 0, 인용 안 함). "각도"는 해당 소스를 fetch한 검색 각도. "C"는 추출 클레임 수.

### 각도 1 — 현장 모바일 네비게이션
1. Scandit — *Scanning at Scale: UX Insights* — **primary** — C5 — https://www.scandit.com/blog/scanning-at-scale-ux-insights/
2. Strich KB — *Camera access issues in iOS PWA* — secondary — C4 — https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa
3. UXPin — *Responsive Design for Touch Devices* — secondary — C5 — https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/
4. Stefan Karabin (Medium) — *7 UX Best Practices for Warehouse Mobile Apps* — blog — C5 — https://medium.com/@stefan.karabin/7-ux-design-best-practices-for-warehouse-mobile-apps-b6e2a0a6940f
5. lollypop.design — *Wizard UI Design* — blog — C5 — https://lollypop.design/blog/2026/january/wizard-ui-design/
6. SAP — *Fiori Design iOS* — unreliable (C0, 인용 안 함) — https://www.sap.com/design-system/fiori-design-ios/

### 각도 2 — 데이터 입력 & 스캔-우선
7. boxwise.io — *Barcode Scanning in the Warehouse* — blog — C5 — https://boxwise.io/blog/barcode-scanning-warehouse/
8. weweb.io — *Multi-step Form Design* — blog — C5 — https://www.weweb.io/blog/multi-step-form-design
9. edana.ch — *Can a Web App (PWA) Access the Camera Like Native?* — blog — C5 — https://edana.ch/en/2026/03/25/can-a-web-app-pwa-access-the-camera-like-a-native-app/
10. novacura.com — *Barcode WMS Best Practices* — blog — C4 — https://www.novacura.com/barcode-wms-best-practices/
11. ivyforms.com — *Multi-step vs Single-step Forms* — blog — C5 — https://ivyforms.com/blog/multi-step-forms-single-step-forms/
12. fastercapital.com — *Barcode UX* — unreliable (C0, 인용 안 함) — https://fastercapital.com/content/Barcode-user-experience--Designing-Intuitive-Barcode-Scanning-Interfaces-for-Mobile-Apps.html

### 각도 3 — 인간공학 (엄지존·글랜서빌리티)
13. NN/g — *Touch Target Size* — **primary** — C5 — https://www.nngroup.com/articles/touch-target-size/
14. parachutedesign.ca — *Thumb Zone UX* — blog — C5 — https://parachutedesign.ca/blog/thumb-zone-ux/
15. design-bootcamp (Medium) — *Design for Glanceable Interfaces* — blog — C5 — https://medium.com/design-bootcamp/design-for-glanceable-interfaces-how-preattentive-vision-shapes-intuitive-interactions-d2042b119280

### 각도 4 — 엔터프라이즈 디자인 시스템
16. IBM Carbon — *Spacing Overview* — **primary** — C4 — https://carbondesignsystem.com/elements/spacing/overview/
17. Material — *Data Tables* — **primary** — C5 — https://m2.material.io/components/data-tables
18. WCAG 2.2 — *Target Size (Minimum)* — **primary** — C4 — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
19. Material 3 — *Layout Density* — unreliable (C0, 인용 안 함) — https://m3.material.io/foundations/layout/understanding-layout/density

### 각도 5 — PWA·iOS 스캔 한계
20. dev.to (ilhannegis) — *Barcode Scanning on iOS: the Missing Web API and a WebAssembly Solution* — blog — C5 — https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2
21. magicbell.com — *PWA iOS Limitations & Safari Support* — blog — C5 — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
22. caniuse — *BarcodeDetector API* — secondary — C5 — https://caniuse.com/mdn-api_barcodedetector

### 각도 6 — 실존 앱 케이스 스터디
23. Microsoft — *Transform Technician Experience with the New Field Service Mobile UX (Dynamics 365)* — **primary** — C5 — https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2023/10/27/transform-technician-experience-with-the-new-field-service-mobile-ux/
24. Rossul — *Warehouse Management System (portfolio)* — **primary** — C5 — https://www.rossul.com/portfolio/warehouse-management-system/
25. Dynamsoft — *Build a Simple PWA Barcode Reader* — blog — C1 — https://www.dynamsoft.com/codepool/build-simple-pwa-barcode-reader.html

---

*본 문서는 deep-research 워크플로(2026-06-10)의 종합 결과를 보존한 근거 자료다. 구현 권고(§4.2)의 실제 적용은 별도 디자인/구현 플랜에서 다룬다.*
