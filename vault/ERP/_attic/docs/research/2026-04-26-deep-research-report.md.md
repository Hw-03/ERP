---
type: file-explanation
source_path: "_attic/docs/research/2026-04-26-deep-research-report.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-04-26-deep-research-report.md — 2026-04-26-deep-research-report.md 설명

## 이 파일은 무엇을 책임지나

`2026-04-26-deep-research-report.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Hw-03/ERP 저장소 심층 분석 보고서`
- `경영진 요약`
- `분석 범위와 가정`
- `저장소 개요와 최근 활동`
- `아키텍처와 데이터 모델`
- `코드 품질과 주요 리스크`
- `우선순위 개선 로드맵`
- `문서 테스트 CI/CD 모니터링 보강안`
- `Deployment`
- `Target profile`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# Hw-03/ERP 저장소 심층 분석 보고서

## 경영진 요약

Hw-03/ERP는 소규모 제조 현장을 염두에 둔 경량 MES/ERP 성격의 내부 프로토타입으로 보이며, 현재의 실질 스택은 FastAPI·SQLAlchemy·SQLite(WAL) 백엔드와 Next.js 14 프런트엔드, 그리고 `/legacy` 중심의 데스크톱 셸 UI다. README와 아키텍처 문서, 운영 스크립...

이 저장소의 강점은 분명하다. 첫째, 라우터–서비스–모델의 계층 분리가 비교적 명확하고, 재고 계산을 `stock_math.py`로 일원화해 N+1과 계산식 드리프트를 줄이려는 의도가 선명하다. 둘째, 앱 기동 시 DB를 암묵 변경하던 부작용을 `bootstrap_db.py`로 떼어내 운영 통제를 강화했다. 셋째, ...

반대로, 이 저장소가 바로 “안전한 운영 제품”이라고 보기는 어렵다. 가장 큰 리스크는 인증·보안이다. 관리자 PIN 기본값 `0000`, 관리자 PIN 평문 저장, 직원 PIN의 unsalted SHA-256, 승인/조회 API에서 실질 세션 인증 없이 `employee_id`를 클라이언트가 넘겨 작업하는 구조는 ...

우선순위는 명확하다. 단기적으로는 인증/승인 모델 정비, 문서 정합성 회복, 업데이트 경로 불일치 수정, production 프로필 정리, CI에 build와 artifact 단계를 추가하는 것이 ROI가 가장 높다. 중기적으로는 Alembic 기반 마이그레이션 체계화, 관측성 도입, Playwright E2E 자동...

## 분석 범위와 가정

이 보고서는 연결된 entity["organization","GitHub","code hosting platform"] 저장소 Hw-03/ERP의 코드, 문서, 테스트/CI 설정, 운영 스크립트, Docker/NAS 배포 구성을 1차 근거로 사용했고, 보안·배포·관측성·데이터베이스 운영 판단에는 공식 문서를 보...

다만 몇 가지 한계가 있다. GitHub 커넥터의 `fetch_file` 출력은 파일 내용을 하나의 blob 형태로 제공하는 경우가 많아, 이 보고서의 “파일/라인 참조”는 엄밀한 줄 번호보다는 파일·함수·상수·엔드포인트 단위의 근거 제시 중심이다. 또한 최근 커밋 분석은 커밋 메시지와 메타데이터 수준이며 각 dif...

## 저장소 개요와 최근 활동

README와 아키텍처 문서에 따르면 이 저장소는 backend, frontend, docs, scripts, docker를 중심으로 구성되며, backend는 FastAPI·SQLAlchemy·SQLite, frontend는 Next.js 14·React·Tailwind·TypeScript strict를 사용한다....

README는 이 프로젝트를 “경량 MES 프로토타입”으로 소개하지만 저장소 이름은 ERP이고, `main.py`의 앱 타이틀과 루트 응답 역시 여전히 “MES” 명칭을 쓴다. 이 명명 불일치는 단순 브랜딩 문제가 아니라, 과거 설계의 일부 흔적이 아직 문서와 코드 곳곳에 남아 있음을 시사한다. 실제로 2026년 4...

아래 비교표는 README, 아키텍처 문서, requirements/package.json, CI 설정, Docker/NAS 배포 정의를 종합한 것이다. fileciteturn86file0L1-L1 fileciteturn87file0L1-L1 fileciteturn77file0L1-L1 fil...

| 컴포넌트 | 책임 | 핵심 파일 | 현재 판단 |
|---|---|---|---|
| 백엔드 진입점 | 라우터 등록, CORS, 예외 처리, 헬스체크 | `backend/app/main.py` | entrypoint는 명확하지만 health와 문서 설명에 일부 드리프트가 있음 |
| 도메인 API 레이어 | 품목, 재고, 생산, BOM, 직원, 요청, 설정 | `backend/app/routers/*` | 엔드포인트 분리가 잘 되어 있으나 인증 경계가 약함 |
| 비즈니스 서비스 | 재고 연산, 무결성 점검, 승인/예약 로직 | `backend/app/services/*` | 핵심 규칙이 서비스층에 모여 있어 구조는 양호 |
| 데이터 모델/스키마 | SQLAlchemy 모델, Pydantic 입출력 계약 | `models.py`, `schemas.py` | 모델 수가 많고 풍부하지만 일부 계약 불일치 존재 |
| DB 부트스트랩/마이그레이션 | `create_all`, raw DDL, seed, ERP 코드 백필 | `backend/bootstrap_db.py` | 초기 민첩성은 높지만 운영 안정성은 낮음 |
| 프런트 API 클라이언트 | 타입 정의와 fetch 래퍼 | `frontend/lib/api.ts` | 타입 정보가 풍부하나 서버 계약과 일부 어긋남 |
| 프런트 메인 UI | `/legacy` 셸과 데스크톱/모바일 섹션 | `frontend/app/legacy/_components/*` | 기능은 풍부하나 레거시 부담이 큼 |
| 운영 스크립트 | 백업, 정합성 체크, 복구 | `scripts/ops/*`, `docs/OPERATIONS.md` | 소규모 현장 운영에는 실용적 |
| CI | backend pytest/compile, frontend lint/tsc/vitest | `.github/workflows/ci.yml` | 기본 품질 게이트는 있으나 build/배포/보안 단계 부재 |
| Docker/NAS 배포 | 선택적 컨테이너 실행 | `backend/Dockerfile`, `frontend/Dockerfile`, `docker/docker-compose.nas.yml` | 운영보다 개발에
...
```
