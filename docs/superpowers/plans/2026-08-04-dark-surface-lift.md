# 다크 표면 명도 상향 구현 계획

**GOAL:** 다크 모드의 모든 기본 표면을 한 단계 밝은 딥 슬레이트로 조정하면서 의미색 대비와 기존 무글로우 정책을 유지한다.

**목표:** 페이지·카드·팝업의 검정에 가까운 체감을 줄인다.

**구조:** `globals.css`의 다크 표면 토큰만 변경한다. 토큰 계약 테스트는 정확한 값과 의미색 대비를 보호하며, 라이트 테마와 의미색·채움색은 변경하지 않는다.

---

## 실행 전략

> **추천 모델: GPT-5.6 Luna** - 하나의 테마 토큰 그룹과 계약 테스트를 조정하는 좁은 프런트엔드 작업입니다.
> **추천 추론 수준: 낮음** - 승인된 값으로의 기계적 전환과 대비 재검증만 필요합니다.
> **실행 형태: 단독** - 테스트와 토큰 변경이 순차적으로 연결되어 있습니다.

## 파일 구조

- 수정: `frontend/lib/__tests__/dark-theme-tokens.test.ts` — 새 표면 토큰과 팝업 토큰의 계약, 대비 기준을 검증한다.
- 수정: `frontend/app/globals.css` — 다크 테마의 배경·surface·팝업 토큰을 승인된 딥 슬레이트 값으로 전환한다.

### 작업 1: 표면 토큰 계약을 먼저 실패시킨다 `[GPT-5.6 Luna] [순차]`

**파일:**
- 수정: `frontend/lib/__tests__/dark-theme-tokens.test.ts`

- [ ] `--c-bg`, `--c-s1`~`--c-s4`의 기대값을 각각 `#151a21`, `rgba(27, 34, 42, 0.96)`, `rgba(35, 44, 54, 0.96)`, `rgba(44, 55, 67, 0.96)`, `rgba(56, 69, 83, 0.98)`로 바꾼다.
- [ ] `expect(tokens["--c-popup-bg"]).toBe("#1b222a");` 계약을 추가한다.
- [ ] 아래 명령으로 기존 토큰에서 실패하는지 확인한다.

```powershell
cd frontend
npm test -- lib/__tests__/dark-theme-tokens.test.ts
```

기대 결과: 기존 `#0d1117` 및 이전 surface 값 때문에 실패한다.

### 작업 2: 승인된 딥 슬레이트 표면을 적용한다 `[GPT-5.6 Luna] [순차]`

**파일:**
- 수정: `frontend/app/globals.css`

- [ ] `:root[data-theme="dark"]`에서 다음 토큰만 교체한다.

```css
--background: #151a21;
--c-bg: #151a21;
--c-s1: rgba(27, 34, 42, 0.96);
--c-s2: rgba(35, 44, 54, 0.96);
--c-s3: rgba(44, 55, 67, 0.96);
--c-s4: rgba(56, 69, 83, 0.98);
--c-popup-bg: #1b222a;
```

- [ ] 의미 전경색, `*Solid` 채움색, 공정색, 텍스트색, 테두리, 그림자, hover·glow 토큰은 수정하지 않는다.
- [ ] 작업 1의 명령을 다시 실행해 통과와 의미색·공정색·흰 글자 채움 대비 4.5:1 이상을 확인한다.

### 작업 3: 전체 프런트엔드 회귀를 확인한다 `[GPT-5.6 Luna] [순차]`

**파일:**
- 변경 없음

- [ ] 아래 명령을 순서대로 실행한다.

```powershell
cd frontend
npm test
npm run lint:strict
cd ..
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend
```

- [ ] 동결된 `frontend/app/mes/_components/_weekly_sections/`, `frontend/app/mes/_components/DesktopWeeklyReportView.tsx`, `frontend/app/mes/_components/mobile/MobileShell.tsx`가 diff에 없는지 확인한다.
- [ ] 사용자 확인용 서버 `http://localhost:3002/mes?tab=dashboard`에서 페이지·카드·사이드바·팝업 표면의 체감을 확인한다.
- [ ] 커밋·푸시는 사용자가 명시적으로 요청하기 전까지 수행하지 않는다.
