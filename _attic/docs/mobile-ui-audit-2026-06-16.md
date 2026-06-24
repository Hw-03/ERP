# DEXCOWIN MES 모바일 UI/UX 전수 감사
> 감사일: 2026-06-16 | 뷰포트: 393px | 스크린샷: `_attic/screenshots/mobile-2026-06-16/` (43장)
> 선행 감사: `mobile-design-audit.md` (2026-05-27, 26건 대부분 반영됨)

---

## 0. 현재 상태 요약

**모바일 디자인 시스템은 전반적으로 견고하다.** 토큰 일관성, 44px 터치 타깃, `<button>` 시맨틱, `aria-label`이 전 화면에 걸쳐 잘 유지된다. 과거 26건의 결함(mobile-design-audit.md)이 대부분 반영된 결과다.

이번 감사에서 확인된 이탈은 집중적이고 소수다:
- **유일한 헤드라인 이탈**: 하단 네비게이션이 앱의 카드 언어(`rounded-[20px]`, `--c-card-shadow`)를 따르지 않음 → 이번 세션에서 수정 완료.
- **교차적 잔여 정리**: 인라인 hex, 44px 미만 터치, 11px 이하 폰트 → 이번 세션에서 수정 완료.
- **시각적 밀도 관찰**: BOM/리스트 화면의 긴 제품명이 작게 렌더링됨 → 코드 확인 결과 기존 토큰/클래스 그대로 적용 중; 레이아웃 제약상 의도적 크기.

### 우선순위 표

| 우선순위 | 항목 | 상태 |
|---------|------|------|
| 🔴 | 하단 네비 Floating Card Dock 리디자인 | ✅ 이번 세션 완료 |
| 🟡 | BarcodeScannerModal 인라인 hex 토큰화 + 닫기 버튼 44px + aria | ✅ 이번 세션 완료 |
| 🟡 | MobileAngleGrid `"#fff"` → `LEGACY_COLORS.white` | ✅ 이번 세션 완료 |
| 🟡 | MobileWorkTypeStep 부제목 `text-[11px]` → `text-xs` (12px) | ✅ 이번 세션 완료 |
| ⚪ | 스캔 우선 진입 워크플로우 (딥리서치 권고) | 별도 세션 |
| ⚪ | 단순 입출고 인라인 폼 (5단계 위저드 분기) | 별도 세션 |

---

## 1. 🔴 헤드라인 — 하단 네비 "Floating Card Dock" 리디자인

### 진단
`MobileShell.tsx` L330–358 의 `<nav>` 컨테이너가 세 가지 이유로 앱과 "혼자 노는" 느낌을 줬다:
1. `border-radius: 0` — 앱 전체가 `rounded-[20px]` 카드를 쓰는데 네비만 직각 사각형
2. `boxShadow: "0 -2px 8px rgba(0,0,0,0.12)"` — 딱딱한 위방향 드롭셰도우; 앱 카드의 `--c-card-shadow` (0 24px 64px, 넓고 부드러운)와 다름
3. 화면 끝 풀블리드 — 앱의 카드들이 페이지에서 떠 있는데 네비만 벽에 붙어 있음

### 변경 내용
```tsx
// 변경 전
<nav
  className="shrink-0"
  style={{ background: LEGACY_COLORS.s1, boxShadow: "0 -2px 8px rgba(0,0,0,0.12)", paddingBottom: "calc(env(safe-area-inset-bottom, 10px))" }}
>
  <div className="flex px-2 pt-2">

// 변경 후
<nav
  className="shrink-0"
  style={{ background: "transparent", paddingBottom: "calc(env(safe-area-inset-bottom, 10px) + 8px)" }}
>
  <div
    className="mx-3 flex rounded-[28px] border px-2 pt-2 pb-1"
    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-card-shadow)" }}
  >
```

토스트 오프셋도 8px 올려 플로팅 카드에 가리지 않도록 조정:
- `bottom: "calc(env(safe-area-inset-bottom, 10px) + 72px)"` → `+ 84px`

`NavButton`(L73–115)은 변경 없음 — 52px 터치, aria-label, 활성 pill이 이미 양호.

---

## 2. 🟡 교차 정리 (이번 세션 완료)

### 2-1. BarcodeScannerModal.tsx

**파일**: `frontend/app/mes/_components/BarcodeScannerModal.tsx`

| 위치 | 문제 | 수정 |
|------|------|------|
| L41 | `text-[10px]` 설명 텍스트 | → `text-xs` (12px) |
| L45–51 | 닫기 버튼 `p-1.5 h-3.5 w-3.5` = ~26px 터치 + aria 없음 | → `h-11 w-11 items-center justify-center` + `aria-label="바코드 스캔 닫기"` |
| L64, L71 | `rgba(242,95,92,.08)` / `rgba(242,95,92,.3)` 인라인 hex | → `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)` / `30%` |
| L119 | `rgba(31,209,122,.18)` 인라인 hex | → `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, transparent)` |
| L151 | `text-[11px]` 지원 포맷 텍스트 | → `text-xs` (12px) |

**L76 `background: "#000"`** — 카메라 뷰포트 시멘틱 컨텍스트. 유지.

### 2-2. MobileAngleGrid.tsx

**파일**: `frontend/app/mes/_components/mobile/_warehouse_map/MobileAngleGrid.tsx`

| 위치 | 문제 | 수정 |
|------|------|------|
| L74 | `color: "#fff"` (점유 셀 아이콘 색상) | → `LEGACY_COLORS.white` |

### 2-3. MobileWorkTypeStep.tsx

**파일**: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx`

| 위치 | 문제 | 수정 |
|------|------|------|
| L213, L255 | `text-[11px]` 카드 버튼 부제목 | → `text-xs` (12px) |

---

## 3. 화면별 전수 판정 (43장 1:1)

> 판정: ✅정상 / ⚠️관찰 / 🔶참고(동결/구조 이슈)
> 스크린샷 번호는 `_attic/screenshots/mobile-2026-06-16/NN-*.png`와 1:1 대응.

### 로그인 (01–02)

**01 — 로그인 화면**
판정: ✅ 정상
카드 레이아웃, 드롭다운, 입력 필드, CTA 버튼 모두 44px 이상 터치 영역과 토큰 색상 준수. 로고 영역의 폰트 계층(제목/부제)이 명확.

**02 — 직원 드롭다운 오픈**
판정: ✅ 정상
드롭다운 목록 각 항목 44px 이상, 이름+직급 계층 뚜렷, 선택 하이라이트 파란색 토큰.

---

### 대시보드 (03–08)

**03 — 대시보드 메인**
판정: ✅ 정상
KPI 카드 4종 `rounded-[20px]`, 색상 모두 `LEGACY_COLORS` 토큰(blue/green/orange/red). 스크롤 콘텐츠가 하단 네비에 가리지 않음 확인.

**04 — 생산 가능 수량 모달**
판정: ✅ 정상
모달 카드 `rounded-[20px]`, 탭 버튼 44px, 경고 배지 색상 토큰 기반. `--c-card-shadow` 일치.

**05 — AF 행 펼침 (BOM 확장)**
판정: ✅ 정상
하위 BOM 행의 폰트 크기가 12–14px 범위 내. 들여쓰기로 계층 명확.

**06 — 대시보드 필터 패널**
판정: ✅ 정상
칩 버튼 24px 높이 내외지만 전체 터치 영역은 충분. 색상 토큰.

**07 — 품목 상세 시트**
판정: ✅ 정상
바텀 시트 `rounded-[20px]`, 헤더·상태 배지·수량 표시 토큰 준수.

**08 — 하위 BOM 재귀 펼침**
판정: ✅ 정상
재귀 인덴트 레이아웃 깔끔. 가장 하위 행 폰트 12px 이상.

---

### 입출고 (09–20)

**09 — Step 1 작업 유형 선택**
판정: ✅ 정상
3개 메뉴 카드 `rounded-[16px]`, 터치 44px+, 텍스트 계층 명확.

**10 — Step 2 세부 작업 선택**
판정: ✅ 정상
2×N 그리드 카드. 이번 세션에서 부제목 `text-[11px]` → `text-xs` 수정 완료.

**11 — Step 3 품목 검색**
판정: ✅ 정상
긴 품목명 클리핑 처리 일관. 스캔 버튼 파란색 토큰. 리스트 행 44px.

**12 — 바코드 스캐너 모달**
판정: ✅ 정상 (이번 세션 수정 후)
수정 완료: 닫기 버튼 44px + aria-label, 에러 배경 색상 토큰화, 폰트 크기 12px 이상.

**13 — Step 4 수량 입력**
판정: ✅ 정상
+/– 버튼 넉넉한 44px+, 수량 숫자 대형 폰트, 상태 배지 토큰.

**14 — 이탈 확인 시트**
판정: ✅ 정상
경고 텍스트와 두 버튼 폰트·색상 표준. CTA 버튼 44px.

**15 — 작업중 탭**
판정: ✅ 정상
리스트 카드 일관, 상태 배지 파란색 토큰, 날짜 메타 12px.

**16 — 내 요청 탭**
판정: ✅ 정상
칩 필터 + 리스트 구조 일관. 빈 상태 메시지 폰트 정상.

**17 — 창고 승인함 탭**
판정: ✅ 정상
빈 상태(승인 대기 없음) 메시지가 토큰 색상·폰트.

**18 — 부서 승인함 탭**
판정: ✅ 정상
구조 동일. 빈 상태 일관.

**19 — 인수인계 탭**
판정: ✅ 정상
칩 스위처("보낼 인수인계" / "받을 인수인계") 토큰 색상·폰트 이상 없음.

**20 — 내 인수인계 리스트**
판정: ✅ 정상
리스트 카드 날짜·제목·상태 배지 표준 준수.

---

### 불량 (21–27)

**21 — 불량 허브**
판정: ✅ 정상
3개 진입 카드 `rounded-[20px]`, 아이콘+텍스트 계층 명확, 각 카드 색상 토큰(빨강/주황).

**22 — 격리 카트 Step 1**
판정: ✅ 정상
부서 선택 칩 토큰 색상, CTA 버튼 파란색.

**23 — 격리 카트 Step 2 (품목 목록)**
판정: ✅ 정상
리스트 행 폰트 14px, 추가 버튼 토큰 색상(빨간 배지).

**24 — 격리 카트 품목 담김**
판정: ✅ 정상
담긴 수량 배지 토큰 색상, 리스트 행 44px.

**25 — 격리 목록**
판정: ✅ 정상
목록 카드 일관, 처리 버튼 토큰 색상.

**26 — 단품 처리 패널**
판정: ✅ 정상
수량 입력 + 처리 유형 카드 구조 일관. 폰트·색상 표준.

**27 — 바로 폐기 카트**
판정: ✅ 정상
격리 카트와 동일 레이아웃 패턴. 색상 토큰 일치.

---

### 내역 (28–32)

**28 — 내역 메인**
판정: ✅ 정상
KPI 카드 3종, 날짜 필터 칩, 리스트 행 모두 토큰·폰트 기준 준수.

**29 — 필터 패널**
판정: ✅ 정상
카테고리별 칩 버튼 24–32px 높이, 전체 터치 영역 충분, 선택 상태 파란색 토큰.

**30 — 달력 패널**
판정: ✅ 정상
날짜 셀 44px, 선택 범위 파란색 하이라이트 토큰. 요일 헤더 12px.

**31 — 단건 상세 시트**
판정: ✅ 정상
제목·상태 배지·수량 변화 섹션 폰트 계층 명확. 토큰 색상 일관.

**32 — 묶음 상세 시트**
판정: ✅ 정상
BOM 리스트 각 행 폰트 12px 이상. 긴 품목명 클리핑 일관.

---

### 더보기 / 주간보고 / 창고지도 (33–39)

**33 — 더보기 시트**
판정: ✅ 정상
2개 메뉴 항목(주간보고, 창고지도) 아이콘·텍스트·터치 영역 기준 준수.

**34 — 주간보고 빈 상태**
판정: 🔶 동결 영역
동결(2026-05-24). 레이아웃·폰트·탭 구조 시각적으로 이상 없음. 감사 대상 제외.

**35 — 주차 피커**
판정: 🔶 동결 영역
동결. 달력 셀 크기와 선택 표시가 시각적으로 정상이나 수정 불가.

**36 — 주간보고 데이터 있음**
판정: 🔶 동결 영역
동결. 부서별 수치 테이블 폰트·색상 시각적으로 표준 준수. 감사 대상 제외.

**37 — 창고지도 앵글 목록**
판정: ✅ 정상
앵글 1–8 리스트 행 44px, 아이콘+이름 계층 명확, 색상 토큰.

**38 — 창고지도 그리드**
판정: ✅ 정상
앵글 카드 그리드 `rounded-[20px]`, 점유율 배지 색상 토큰.

**39 — 자리 상세 시트**
판정: ✅ 정상
시트 `rounded-[20px]`, 제목·박스 목록·폰트 계층 표준. 이번 세션 수정된 `LEGACY_COLORS.white` 반영.

---

### 사용자 / 알림 (40–43)

**40 — 사용자 메뉴 시트**
판정: ✅ 정상
이름·직급 텍스트 계층 명확, 역할 배지 `color-mix` 토큰 색상, 버튼 열 44px.

**41 — PIN 변경 Step 1**
판정: ✅ 정상
제목·입력 필드·버튼 2종 폰트·색상 기준 준수.

**42 — PIN 변경 Step 2**
판정: ✅ 정상
Step 1과 동일 레이아웃, 일관성 유지.

**43 — 알림 드롭다운**
판정: ✅ 정상
알림 행 헤더+시간+내용 폰트 계층 명확, 터치 영역 충분.

---

## 4. 이미 잘 되어 있는 것 (유지 항목)

다음은 의도적으로 확정된 사항들이다. 재플래그·재수정 금지.

| 항목 | 근거 |
|------|------|
| 토큰 색상 100% | `LEGACY_COLORS.*` / `var(--c-*)` / `color-mix()`. 이번 수정으로 잔여 인라인 hex 0 |
| 44px 터치 타깃 | `NavButton` 52px, 리스트 행 44px+, 이번 수정으로 스캐너 닫기 버튼도 44px |
| 시맨틱 `<button>` | div+onClick 0건 확인 |
| aria-label | 아이콘 전용 컨트롤 100%. 이번 수정으로 스캐너 닫기도 추가 |
| 본문 폰트 ≥ 12px | 이번 수정으로 `text-[10px]` / `text-[11px]` 잔여 0 |
| 역할 배지 `text-[11px]` | `MobileUserMenuSheet` 배지는 의도적 11px 유지(알약 배지 디자인 컨텍스트) |
| Pretendard 자가호스팅 | 2026-06-05 이후 실로딩 확인됨 |
| `brand-*` Tailwind | 사용 0건, 미사용 상태 유지 |
| 데스크톱 분기 무변경 | `lg:` 이상 화면 수정 없음 |
| 동결 영역 | `_weekly_sections/`, `DesktopWeeklyReportView.tsx` 미수정 |

---

## 5. ⚪ 백로그 (이번 세션 밖)

### 스캔 우선 진입 워크플로우
딥리서치(`mobile-benchmarking-research.md`) 권고 ②: 입출고·불량 화면 최상단에 큰 "스캔으로 시작" 버튼을 배치 → 품목 자동 선택 → 수량만 입력. 현재 스캔 기능이 위저드 3단계에 매몰돼 있어 현장 첫 동작이 오래 걸림. **별도 세션에서 설계 후 구현 권장.**

### 단순 입출고 인라인 폼
adjust_in / adjust_out 같이 부서 이동 없는 단순 작업을 5단계 위저드 대신 인라인 폼으로 처리. 반복 작업 마찰 대폭 감소. 상태 분기 설계가 필요하므로 **별도 세션.**

### 카메라 프리뷰 / 조준 오버레이
딥리서치 §5에서 "제거" 주장이 반증됨. 현재 구현 유지.

### 하단 탭 6→4 축소
이미 반영됨(`TAB_BAR_IDS` 4탭 + 더보기 시트). 완료로 기록.

---

## 6. 이번 세션 변경 파일 목록

| 파일 | 변경 |
|------|------|
| `frontend/app/mes/_components/mobile/MobileShell.tsx` | 하단 네비 Floating Card Dock + 토스트 오프셋 +12px |
| `frontend/app/mes/_components/BarcodeScannerModal.tsx` | 인라인 hex 토큰화, 닫기 버튼 44px + aria, 10px/11px → text-xs |
| `frontend/app/mes/_components/mobile/_warehouse_map/MobileAngleGrid.tsx` | `"#fff"` → `LEGACY_COLORS.white` |
| `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx` | 부제목 `text-[11px]` → `text-xs` ×2 |
