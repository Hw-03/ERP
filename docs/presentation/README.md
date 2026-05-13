# DEXCOWIN MES — 사내 발표 슬라이드

2026.05 발표용 HTML 슬라이드 데크. 단일 파일이라 USB·메일로 그대로 전달 가능.

## 실행

방법 1 — 더블클릭
```
docs\presentation\index.html
```
크롬·엣지·파이어폭스 모두 OK.

방법 2 — 풀스크린으로 바로
```powershell
start chrome --start-fullscreen "file:///c:/ERP/docs/presentation/index.html"
```

## 키보드 단축키

| 키 | 동작 |
|---|---|
| `→` `↓` `Space` `PgDn` | 다음 슬라이드 |
| `←` `↑` `PgUp` | 이전 슬라이드 |
| `1` ~ `9` | 슬라이드 번호로 직접 점프 (Q&A 복귀에 유용) |
| `Home` / `End` | 첫 / 마지막 슬라이드 |
| `F` | 풀스크린 토글 |
| `ESC` | 풀스크린 해제 |
| `N` | 발표자 노트 패널 토글 |
| `T` | 슬라이드 5 시연 체크리스트 다음 항목 체크 |

## 발표자 노트

- 노트 보기: URL 끝에 `?notes=1` 추가하거나 발표 중 `N`키
- 각 슬라이드마다: 말할 한 줄 / 청중 반응 예상 / Q&A 대비 답변
- 인쇄: `Ctrl+P` → 가로 A4. 슬라이드 한 페이지 + 노트 한 페이지로 출력

## 시연 체크리스트 (슬라이드 5)

발표 도중 alt+tab으로 실제 MES로 이동 → 시연 → 슬라이드 복귀 시 어디까지 했는지 표시.

- 항목 클릭 또는 `T`키로 체크 / 체크 해제
- localStorage 저장 — 새로고침해도 유지
- 전부 체크된 상태에서 `T` 한 번 더 누르면 초기화 (다음 발표 대비)

시연 6항목:
1. PIN 로그인 (20초)
2. 대시보드 KPI (30초)
3. 창고 입출고 — 입고 흐름 (2분)
4. 부서 재고 + 부서 입출고 (1분)
5. BOM 트리 + 부품 역참조 (1분)
6. 관리자 — 부서·직원·품목 마스터 (30초)

총 시연 시간 ≈ 5분 30초.

## 발표 전 점검

- [ ] 회의실 PC에서 한 번 열어 폰트·로고 표시 확인
- [ ] 프로젝터 연결 시 색상·뒷줄 가독성 (특히 빨강 강조 톤)
- [ ] 인터넷 안 되는 경우 대비 — Tailwind/Pretendard/Chart.js CDN 로딩 확인
- [ ] MES 시연 데이터 사전 입력 (재고 위치·BOM 데이터 등)
- [ ] 시연 체크리스트 초기화 (`T` 6번 또는 localStorage 클리어)

## 콘텐츠 업데이트

전부 `index.html` 한 파일에 인라인. 슬라이드별로 `<!-- ============ Slide N ============ -->` 주석으로 구분돼 있음.

자주 바꿀 만한 곳:
- 슬라이드 1 표지의 `2026년 5월` 발표일
- 슬라이드 4 숫자 인포그래픽 (DB 변경 시)
- 슬라이드 7 로드맵 날짜 (`D-18` 등)
- 슬라이드 8 도입 효과 4개 카드

## 파일 구조

```
docs/presentation/
  index.html          # 단일 파일 (CSS·JS·노트·콘텐츠 모두 인라인)
  assets/
    dexcowin-logo.png # 회사 로고 (frontend/public에서 복사)
  README.md           # 이 파일
```

## 데이터 출처

| 슬라이드 | 항목 | 출처 |
|---|---|---|
| 4 | 부품 848개 | `backend/erp.db` items 테이블 |
| 4 | 공정 15종 | `backend/erp.db` items.process_type_code DISTINCT |
| 4 | BOM 805건 | `backend/app/routers/bom.py` 프리셋 |
| 4 | 부서 6개 | `backend/app/routers/departments.py` |
| 4 | 제품 5종 | https://dexcowin.com/ko/ |
| 6 | 5게이트 | `scripts/dev/verify_local.ps1` |
| 6 | 안정성 96점 | `CLAUDE.md` 4행 |
| 7 | 로드맵 | 2026-05-13 사용자 확정 |
