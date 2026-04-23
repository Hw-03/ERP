---
type: guide
project: ERP
status: active
tags:
  - erp
  - faq
  - guide
aliases:
  - 자주 묻는 질문
  - FAQ
  - 문제해결
---

# FAQ: 자주 묻는 질문 & 트러블슈팅

> [!summary] 용도
> 시스템을 쓰다가 헷갈리는 점, 자주 생기는 문제, 그 답을 모아놓은 곳. 특정 기능별 FAQ는 해당 문서에도 있지만 여기서는 전반적인 질문 위주.

---

## 🔰 기본 이해

### Q1. 이 ERP는 정확히 뭘 하는 시스템인가?
자재 입고 → 부서 이동 → 생산(자재 차감, 완제품 증가) → 출하 까지의 흐름을 기록·관리하는 내부 운영 시스템. 회계나 인사는 포함 안 함. MES(제조 실행)에 가까운 프로토타입.

### Q2. 왜 백엔드와 프론트엔드가 나뉘어있나?
역할 분리. 백엔드(FastAPI)는 데이터와 규칙을 책임지고, 프론트엔드(Next.js)는 사용자 화면만 담당. 변경 시 서로 영향 최소화 + 프론트만 따로 업그레이드 가능.

### Q3. SQLite랑 PostgreSQL 둘 다 쓰는 이유?
- **SQLite**: 개발/단일 NAS 운영용 (파일 기반, 가볍다)
- **PostgreSQL**: 확장/다중 접속 운영용 (`docker-compose.yml` 기준)
- 현재 두 방식 모두 가능하도록 설계. `schema.sql`은 PostgreSQL 이관 용도.

### Q4. legacy 폴더가 뭐고 왜 있나?
`frontend/app/legacy/` 가 **현재 실제 쓰는 UI**. 그 외 `app/inventory`, `app/admin` 등 루트 경로들은 새 UI 작업용 리다이렉트 혹은 미완성. 수정할 때 legacy 쪽을 봐야 실제 화면에 반영됨.

---

## 📦 재고 관련

### Q5. 재고가 창고/부서 2군데로 나뉘어있는 이유?
- **창고**는 "미사용 재고". 아직 어느 부서에도 안 나간 상태.
- **부서**는 "현장 재고". 조립팀 책상 위에 올라가있는 상태.
- 이걸 구분해야 실제 가용 자재와 "나가있지만 돌아올 수 있는" 자재를 구분해서 관리 가능.

### Q6. pending이 걸렸는데 왜 재고는 그대로인가?
pending은 "예약만 해둔 상태". 실제 차감은 배치 확정 시. 가용 수량(available) 계산할 때만 pending을 뺀다. 배치 취소하면 pending만 풀리고 재고는 변동 없음.

### Q7. 창고 재고가 음수가 될 수 있나?
설계상 방지. 출고/이관 시 사전 검증. 그래도 음수가 보이면 → 시드 스크립트나 직접 SQL 조작으로 잘못 건드린 경우. `adjust`로 수정.

### Q8. 불량 처리한 재고는 어디로 가나?
그냥 사라지지 않음. `inventory_locations.defective_quantity` 에 옮겨지고 총수량은 유지. 완전히 없애려면 → 공급업체 반품(`supplier-return`) 또는 폐기(`scrap`) API 사용.

---

## 🏷 ERP 코드

### Q9. ERP 코드는 어떻게 생기나?
`{기호}-{공정}-{시리얼}[-{옵션}]` 4파트. 예: `346-AR-0001`, `3-PA-0012-BG`.
- 기호: 어느 제품 모델용인지 (1~100번 슬롯)
- 공정: 어느 단계 자재/제품인지 (TR/TA/HR/HA 등)
- 시리얼: 같은 기호+공정 안의 순번
- 옵션: 색상/사양 등 (있을 때만)

### Q10. 같은 제품인데 ERP 코드가 여러 개일 수 있나?
있을 수 있음. 옵션(BG, WM 등)이 다르면 별개 코드. 기호 조합이 다르면(예: 3만 쓰는지, 346 공용인지) 별개 코드.

### Q11. ERP 코드 파싱이 뭔가?
문자열을 쪼개서 의미 있는 부분(기호/공정/시리얼/옵션)으로 분리하는 것. `POST /api/codes/parse` 로 검증.

### Q12. 수동으로 ERP 코드 지정할 수 있나?
가능하지만 권장 안 함. 자동 생성이 중복 방지 + 순번 관리 해줌. 수동 입력 시 검증(`validate_code`) 거치고, 중복 가능성 주의.

---

## 🔄 생산/배치

### Q13. 배치랑 거래(transaction)의 차이?
- **배치**: 여러 재고 변동의 묶음. "이번 생산 건" 한 단위.
- **거래**: 개별 재고 변동 한 건. `transaction_logs` 에 행 하나씩.
- 배치 하나 확정 시 → 여러 거래(BACKFLUSH 다수 + PRODUCE 1건) 생성.

### Q14. 배치 확정 중 에러 나면 어떻게 되나?
트랜잭션으로 묶여있어서 전부 원상복구(rollback). 재고에 절반만 반영되는 일은 없음. 단, 프론트 쪽 UI 상태는 새로고침 필요할 수 있음.

### Q15. BOM 바꾸면 기존 배치도 바뀌나?
아니다. 이미 생성된 배치의 라인은 생성 시점 BOM 기준으로 고정. 확정 후에도 동일. 새로 만든 배치만 새 BOM 반영.

### Q16. 생산 입고 API 따로 있는데 queue 배치랑 뭐가 다른가?
- `POST /api/production/receipt` — **빠른 처리용**. BOM 즉시 전개해서 즉시 반영. 수량 조정/검토 없이 한 방에.
- `queue` 배치 — **검토용**. OPEN 상태로 만들고, 실제 투입 반영 후 확정.
- 대량/정밀 처리는 queue, 단건/간단 건은 receipt.

---

## 🖥 화면 관련

### Q17. 화면이 모바일 / 데스크톱 둘 다 있다던데?
`frontend/app/legacy/page.tsx` 에서 `lg:hidden` 기준으로 분기. 작은 화면이면 모바일 탭 UI, 큰 화면이면 데스크톱 `LegacyLayout`. 기능은 대체로 동일.

### Q18. 관리자 암호는 어디서 바꾸나?
AdminTab 또는 `/api/settings/pin` 엔드포인트. 기본 암호는 코드 확인 필요 (프로토타입이라 보안 단순).

### Q19. 바코드 스캐너 어떻게 연동되나?
`BarcodeScannerModal.tsx` 컴포넌트가 카메라 스트림 받아서 디코딩. 결과로 ERP 코드 입력칸 채움. 스캐너 장비에 따라 키보드 wedge로도 동작.

---

## ⚙️ 운영/배포

### Q20. 서버 재시작해도 데이터 유지되나?
- SQLite: `erp.db` 파일 유지되면 OK. Docker 볼륨 설정 확인.
- PostgreSQL: 볼륨 마운트 필수. 볼륨 없이 컨테이너 재생성하면 날아감.

### Q21. 백업은 어떻게?
- SQLite: `erp.db` 파일 복사만 해도 됨.
- PostgreSQL: `pg_dump`.
- 중요 DB는 자동화된 일일 백업 권장.

### Q22. NAS 운영 시 주의사항?
`docker-compose.nas.yml` 사용. SQLite 기반. 파일 락 이슈 없도록 다중 접속 제한. 자세한 건 `docker-compose.nas.yml` 참고.

### Q23. 새 기능 추가하려면 어디부터 봐야 하나?
1. ERP MOC → 전체 그림
2. `CLAUDE.md` → 작업 규칙
3. 관련 라우터/컴포넌트 → 해당 기능 근처 파일 탐색
4. 용어 사전 → 모르는 용어 찾기
5. 실제 코드 (`frontend/app/legacy/` 또는 `backend/app/routers/`)

### Q24. 에러 로그 어디서 보나?
- 백엔드: FastAPI 콘솔 (uvicorn 로그)
- 프론트: 브라우저 개발자 도구 Console
- 운영 환경: Docker `docker logs <container>`

---

## 🧩 데이터/스크립트

### Q25. data/ 폴더의 엑셀 파일들은 뭔가?
원본 수기 관리 데이터. `erp_integration.py` 등 스크립트로 DB에 이관. 이미 DB 기반으로 운영 중이면 엑셀은 참고용.

### Q26. 시드 스크립트 돌렸는데 중복 들어가면?
각 `seed_*.py` 스크립트마다 중복 방지 로직 다름. 일반적으로 `INSERT OR IGNORE` 또는 `get_or_create` 패턴 사용. 실행 전 dry-run 가능하면 확인 권장.

### Q27. schema.sql 수정하면 실제 DB가 바뀌나?
아니다. `schema.sql` 은 **참고용** 문서. 실제 DB 스키마는 `models.py` 기준으로 SQLAlchemy가 만듦. 이관 시에만 `schema.sql` 로 PostgreSQL 초기화.

---

## 🐛 트러블슈팅

### Q28. "이 품목의 재고가 이상해요" (UI 값 ≠ 실제 재고)
순서대로 확인:
1. 브라우저 새로고침 (캐시 문제)
2. `GET /api/inventory/summary` 로 API 응답 확인
3. DB 직접 조회: `SELECT * FROM inventory WHERE item_id = ?`
4. `inventory_locations` 의 부서별 합계와 `total_quantity` 비교 → 차이 있으면 `_sync_total` 호출 필요
5. `transaction_logs` 최근 몇 건 역추적

### Q29. 배치 확정 버튼 눌렀는데 반영 안 됨
1. 응답 상태코드 확인 (개발자도구 Network)
2. 이미 CANCELLED/CONFIRMED 된 배치 아닌지 확인
3. 재고 부족 에러인지 응답 메시지 확인
4. 백엔드 콘솔 에러 로그 확인

### Q30. API 응답이 느리거나 타임아웃
1. BOM 깊이가 너무 깊어서 전개 오래 걸림 → 순환 의심
2. DB 연결 문제 → `database.py` 세션 확인
3. 큰 엑셀 내보내기 → 스트리밍 방식 아니라 메모리 이슈

### Q31. 그래프뷰에서 노드가 안 보임
Obsidian 그래프 필터에 `path:"ERP-Vault"` 등 설정. 또는 `.obsidian/graph.json` 의 colorGroups 확인. 링크 없는 orphan 문서면 showOrphans 옵션 체크.

### Q32. 링크가 깨져있음 (Obsidian에서 빨간 링크)
1. 파일명 변경했는데 링크 안 바뀜 → Obsidian의 "Rename links" 옵션 활성화 확인
2. 링크 경로의 대소문자 차이
3. 확장자 혼동 (`.md.md` 파일이 있음)

---

## 📚 관련 문서

- ERP MOC — 메인 허브
- 용어 사전 — 용어 풀이
- 품목 등록 시나리오
- 재고 입출고 시나리오
- 생산 배치 시나리오
- 분해 반품 시나리오

Up: [[_guides]]
