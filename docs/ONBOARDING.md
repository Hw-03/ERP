# 신규 인원 온보딩 (X-Ray ERP)

이 문서는 처음 ERP 프로젝트를 받는 운영자/개발자가 **1시간 안에 첫 작업까지** 도달하기 위한 절차를 정리한다.

> 한국어 LAN 환경 운영 기준. 외부 노출 시나리오는 별도.

---

## 1. 환경 준비 (10분)

| 도구 | 권장 버전 | 확인 명령 |
|---|---|---|
| Python | 3.11+ (3.13 까지 OK) | `py --version` |
| Node | 20+ | `node --version` |
| Git | 최신 | `git --version` |

PostgreSQL/Docker 는 **불필요**. 기본은 SQLite + uvicorn + next dev.

---

## 2. 클론 + 의존성 설치 (15분)

```bat
git clone https://github.com/Hw-03/ERP.git
cd ERP
start.bat
```

`start.bat` 이 다음을 자동 처리:
1. `frontend/node_modules` 가 없거나 lockfile 이 더 새로우면 `npm install`
2. 백엔드 핵심 의존성 (`fastapi`, `uvicorn`, `sqlalchemy` 등) 누락 시 `pip install -r backend/requirements.txt`
3. `bootstrap_db.py --schema` 자동 실행 — 신규 테이블 idempotent 생성 (Phase 5.4-B)
4. LAN IP 자동 감지 → 백엔드 (8010) + 프론트 (3000) 별도 창에서 기동

첫 실행은 5~10분. 두 번째부터는 즉시.

---

## 3. 첫 헬스체크 (5분)

브라우저:
- `http://<감지된IP>:3000` — 모바일/데스크톱 자동 분기
- `http://127.0.0.1:8010/health` — `{"status":"ok"}` 확인
- `http://127.0.0.1:8010/docs` — OpenAPI 인터랙티브

CLI:
```bat
curl http://127.0.0.1:8010/health
curl http://127.0.0.1:8010/health/detailed
```

---

## 4. 첫 작업 시뮬 (15분)

### 4.1. 백업 1회
```bat
scripts\ops\backup_db.bat
scripts\ops\verify_backup.bat
```
→ `backend\_backup\erp_*.db` 생성 확인. integrity 'ok' 출력.

### 4.2. 입출고 1건 (모바일)
1. 모바일 화면 (≤480px) → 하단 nav 의 **창고입출고** 진입
2. Step 1 "창고 → 생산부" 선택
3. Step 2 부서 선택 → Step 3 품목 1건 + 수량 1
4. Step 4 확인 → 완료 토스트

→ 화면 상단 ▼ pill 에 "방금 완료 · ..." 표시. 재고 화면 진입 시 해당 품목 수량 갱신 확인.

### 4.3. 관리자 1회
1. 하단 nav **관리자** → PIN `0000` 입력
2. 상품 섹션 → 첫 품목 선택 → 안전재고 수정 1회
3. → audit log 진입: `GET /api/admin/audit-logs?action=item.update`

---

## 5. 자주 보는 화면

| 모바일 | 설명 |
|---|---|
| 재고 | 전체 품목 + 부서별 위치 + 가용/예약 |
| 창고입출고 | 창고 ↔ 부서 wizard (4 step) |
| 부서입출고 | 부서 → 부서 wizard (4 step) |
| 관리자 | PIN 잠금 → 상품 / 직원 / BOM / 출하묶음 / 설정 |

| 데스크톱 | 추가 |
|---|---|
| /history | 거래 이력 + 필터 + export |
| /alerts | 안전재고 / count 차이 |
| /counts | 실사 등록 + 강제 조정 |
| /queue | 생산 / 분해 / 반품 배치 워크플로 |
| /bom | BOM 트리 + Where-Used |

---

## 6. 막혔을 때

1. `docs/OPERATIONS.md` — 일상 운영 매뉴얼 (백업/복구/audit/Task Scheduler)
2. `docs/CODEX_PROGRESS.md` — 최근 변경 이력 (Phase 5.x 누적)
3. `docs/ITEM_CODE_RULES.md` — ERP 코드 포맷 규칙
4. `docs/API_CHANGELOG.md` — API 변경 이력
5. `docs/AI_HANDOVER.md` — Claude 세션 인계 노트

런타임 이슈:
- 포트 충돌 → `OPERATIONS.md` 의 "포트 점유 처리"
- DB 정합성 의심 → `python bootstrap_db.py --check`
- 프론트 빌드 hang → `frontend\.next\` 삭제 후 재실행

---

## 7. 일상 운영 체크리스트

### 매일
- [ ] `/health/detailed` 응답 ok
- [ ] `scripts\ops\backup_db.bat` 실행 (Task Scheduler 권장)

### 매주
- [ ] `scripts\ops\verify_backup.bat` — 최근 백업 무결성
- [ ] `scripts\ops\cleanup_backups.bat` — 30일 이상 정리

### 월말
- [ ] `/api/admin/audit-logs?since=…` 로 마스터 변경 점검
- [ ] `/api/settings/integrity/inventory?pin=…` 로 재고 정합성 점검

---

## 8. 질문 흐름

운영자 → `OPERATIONS.md` → 막히면 개발자 → `CODEX_PROGRESS.md` 로 최근 작업 확인 → 필요 시 `BACKEND_REFACTOR_PLAN.md` / `FRONTEND_HOOKS_PLAN.md` 의 의도 검토.
