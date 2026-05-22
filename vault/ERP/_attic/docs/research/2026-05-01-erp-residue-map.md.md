---
type: file-explanation
source_path: "_attic/docs/research/2026-05-01-erp-residue-map.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-01-erp-residue-map.md — 2026-05-01-erp-residue-map.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-01-erp-residue-map.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ERP 잔재 매핑 노트 — 2026-05-01`
- `1. 총계`
- `2. 변경 금지 식별자 (절대 건드리지 말 것)`
- `3. 변경 후보 A등급 — 시스템명/로깅/주석 (모바일 수정 가능)`
- `4. 변경 후보 B등급 — 신중 검토 필요 (diff 검토 + 서버 확인)`
- `5. 보존 권장 (역사적 기록, 변경 불필요)`
- `6. 파일별 집계`
- `7. 핵심 결정 요약`
- `절대 변경 금지`
- `모바일에서 바로 가능 (A등급, 회사 PC 확인 불필요)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# ERP 잔재 매핑 노트 — 2026-05-01

> **작업 ID:** MES-NAME-001  
> **작성일:** 2026-05-01 (금)  
> **기준 브랜치:** `feat/hardening-roadmap`  
> (초기 분석은 `claude/analyze-dexcowin-mes-tGZNI` 에서 시작했으나 fast-forward 머지 후 통일. 이 브랜치는 폐기됨.)  
> **수정 여부:** 없음 (읽기 전용 분석)  
> **grep 범위:** 전체 프로젝트 (`_archive/`, `backups/`, `vault/`, `node_modules/`, `.next/` 제외)

---

## 1. 총계

| 분류 | 건수 |
|---|---|
| 변경 금지 (frozen identifier) | 16 |
| 변경 후보 A등급 (시스템명/로깅/주석) | 20 |
| 변경 후보 B등급 (신중 검토 필요) | 4 |
| 보존 권장 (역사적 기록) | 2 |
| **합계** | **42** |

---

## 2. 변경 금지 식별자 (절대 건드리지 말 것)

> 이 항목들은 `erp` 글자가 박혀 있어도 **변경 금지**. DB 컬럼, API 계약, localStorage key, 파일명에 의존하는 전 시스템 영향 범위.

| # | 식별자 | 파일:라인 | 이유 |
|---|---|---|---|
| F-01 | `items.erp_code` (DB 컬럼) | `backend/app/models.py`, `backend/app/schemas.py`, `frontend/lib/api.ts:147` 전반 | DB 컬럼명 — Alembic 없으면 마이그레이션 불가 |
| F-02 | `formatErpCode()` | `frontend/lib/api.ts:147` | DB `erp_code` 필드 직접 사용, 전 화면 영향 |
| F-03 | `erpCodeDept()` | `frontend/app/legacy/_components/legacyUi.ts` | erp_code 컬럼 파싱 |
| F-04 | `erpCodeDeptBadge()` | `frontend/app/legacy/_components/legacyUi.ts:199` | erp_code 컬럼 파싱 |
| F-05 | `ErpCode` class | `backend/app/services/codes.py:44` | 코드 생성/파싱 핵심 클래스 |
| F-06 | `ErpCodeParseRequest`, `ErpCodeGenerateRequest`, `ErpCodeResponse` | `backend/app/schemas.py:533-543` | API 계약 — 변경 시 `/api/codes` 전체 영향 |
| F-07 | `erp.db` (DB 파일명) | `backend/app/database.py:13`, `docker/docker-compose.nas.yml:9,13` 전반 | DB 파일명 — 변경 시 전 Docker/ops 스크립트 영향 |
| F-08 | `erp_code.py` (파일명) | `backend/app/utils/erp_code.py` | 의도적 보존 (CLAUDE.md 명시) |
| F-09 | `ErpLoginGate` (컴포넌트/파일명) | `frontend/app/legacy/_components/login/ErpLoginGate.tsx` | 진입점 컴포넌트 — `legacy/page.tsx:18,33,41` import |
| F-10 | `dexcowin_erp_operator` (localStorage key) | `frontend/app/legacy/_components/login/useCurrentOperator.ts:21` | 운영 중 브라우저 스토리지 데이터 손실 위험 |
| F-11 | `dexcowin_erp_boot_id` (localStorage key) | `frontend/app/legacy/_components/login/useCurrentOperator.ts:22` | 위 동일 |
| F-12 | `Hw-03/ERP` (GitHub 레포명) | — | CI URL, clone 경로 전반 영향 |
| F-13 | `C:/ERP/`, `ERP/` (디렉터리 경로) | `scripts/migrations/fix_legacy_items.py:9`, `scripts/dev/test_encoding.py:7` 등 | 실제 파일시스템 경로 |
| F-14 | `xray-erp-frontend` (`package.json` name) | `frontend/package.json:2`, `frontend/package-lock.json:2,8` | npm 식별자 — lock 파일 재생성 수반 |
| F-15 | `erp-card-anim`, `erp-card-rise`, `erp-letter`, `erp-letter-in` (CSS 클래스) | `frontend/app/legacy/_components/login/ErpLoginGate.tsx:100-101`, `LoginIntro.tsx:107,113,12...
| F-16 | `ERP_Master_DB.csv` (데이터 파일명) | `backend/seed.py:28`, `backend/sync_excel_stock.py:25`, `scripts/dev/erp_integration.py:60-64` | 실제 데이터 파일명 |

---

## 3. 변경 후보 A등급 — 시스템명/로깅/주석 (모바일 수정 가능)

> `start.bat`, ops 스크립트, 백엔드 주석에 박힌 `[ERP]` 텍스트. UI/로그 표기만 변경. 코드 식별자 변경 없음.

| #
...
```
