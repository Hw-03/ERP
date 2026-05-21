---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-04-26-deep-research-report.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-04-26-deep-research-report.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-04-26-deep-research-report.md]]

## 원본 첫 줄 (또는 메타)

```
# Hw-03/ERP 저장소 심층 분석 보고서

## 경영진 요약

Hw-03/ERP는 소규모 제조 현장을 염두에 둔 경량 MES/ERP 성격의 내부 프로토타입으로 보이며, 현재의 실질 스택은 FastAPI·SQLAlchemy·SQLite(WAL) 백엔드와 Next.js 14 프런트엔드, 그리고 `/legacy` 중심의 데스크톱 셸 UI다. README와 아키텍처 문서, 운영 스크립트, CI 설정을 종합하면 “윈도우 PC 한 대를 365일 켜두고 LAN에서 접속하는 운영 모델”이 기본 가정으로 설계되어 있다. fileciteturn86file0L1-L1 fileciteturn87file0L1-L1 fileciteturn80file0L1-L1 fileciteturn88file0L1-L1

이 저장소의 강점은 분명하다. 첫째, 라우터–서비스–모델의 계층 분리가 비교적 명확하고, 재고 계산을 `stock_math.py`로 일원화해 N+1과 계산식 드리프트를 줄이려는 의도가 선명하다. 둘째, 앱 기동 시 DB를 암묵 변경하던 부작용을 `bootstrap_db.py`로 떼어내 운영 통제를 강화했다. 셋째, 2026년 4월 말 커밋 흐름에서 테스트, CI, 운영 스크립트, 접근성, 성능 보강이 짧은 주기로 집중적으로 진행된 점은 유지보수 의지가 높다는 신호다. fileciteturn44file0L1-L1 fileciteturn68file0L1-L1 fileciteturn79file0L1-L1

반대로, 이 저장소가 바로 “안전한 운영 제품”이라고 보기는 어렵다. 가장 큰 리스크는 인증·보안이다. 관리자 PIN 기본값 `0000`, 관리자 PIN 평문 저장, 직원 PIN의 unsalted SHA-256, 승인/조회 API에서 실질 세션 인증 없이 `employee_id`를 클라이언트가 넘겨 작업하는 구조는 내부망 전제라 해도 취약하다. 여기에 문서/스키마 드리프트, 수동 마이그레이션 방식, 개발 모드 중심의 Docker 기본값, 버전·포트 불일치가 겹치면서 운영 리스크를 높인다. fileciteturn47file0L1-L1 fileciteturn48file0L1-L1 fileciteturn50file0L1-L1 fileciteturn53file0L1-L1 fileciteturn40file0L1-L1 fileciteturn41file0L1-L1

우선순위는 명확하다. 단기적으로는 인증/승인 모델 정비, 문서 정합성 회복, 업데이트 경로 불일치 수정, production 프로필 정리, CI에 build와 artifact 단계를 추가하는 것이 ROI가 가장 높다. 중기적으로는 Alembic 기반 마이그레이션 체계화, 관측성 도입, Playwright E2E 자동화를 붙이는 편이 낫다. 장기적으로는 동시 쓰기 증가, NAS/네트워크 파일시스템, 장기 보존 데이터 증가 같은 운영 조건이 생기면 PostgreSQL 전환을 검토해야 한다. SQLite 공식 문서는 WAL이 “여러 reader + 단일 writer” 모델이며 네트워크 파일시스템에 적합하지 않다고 설명하고, FastAPI와 Next.js 공식 문서 역시 production에서는 `--reload`/`next dev`가 아니라 production server 빌드와 실행을 권장한다. fileciteturn78file0L1-L1 citeturn6search0turn6search4turn8search0turn6search6

## 분석 범위와 가정

이 보고서는 연결된 entity["organization","GitHub","code hosting platform"] 저장소 Hw-03/ERP의 코드, 문서, 테스트/CI 설정, 운영 스크립트, Docker/NAS 배포 구성을 1차 근거로 사용했고, 보안·배포·관측성·데이터베이스 운영 판단에는 공식 문서를 보조 근거로 사용했다. 사용자 지시에 따라 대상 플랫폼, 언어 버전, 배포 환경은 “특정 제약 없음”으로 두되, 저장소 내부에 드러난 기본 운영 모델은 “Windows + LAN + 소규모 내부 사용 + SQLite 파일 DB”로 해석했다. fileciteturn86file0L1-L1 fileciteturn87file0L1-L1 fileciteturn80file0L1-L1

다만 몇 가지 한계가 있다. GitHub 커넥터의 `fetch_file` 출력은 파일 내용을 하나의 blob 형태로 제공하는 경우가 많아, 이 보고서의 “파일/라인 참조”는 엄밀한 줄 번호보다는 파일·함수·상수·엔드포인트 단위의 근거 제시 중심이다. 또한 최근 커밋 분석은 커밋 메시지와 메타데이터 수준이며 각 diff 전체를 전수 검토한 것은 아니다. 따라서 “현재 상태의 high-confidence 판단”에는 충분하지만, “정적 분석기 수준의 완전한 라인 단위 감리”로 보기는 어렵다.

## 저장소 개요와 최근 활동

README와 아키텍처 문서에 따르면 이 저장소는 backend, frontend, docs, scripts, docker를 중심으로 구성되며, backend는 FastAPI·SQLAlchemy·SQLite, frontend는 Next.js 14·React·Tailwind·TypeScript strict를 사용한다. 실제 의존성 파일을 보면 백엔드는 `fastapi==0.111.0`, `uvicorn[standard]==0.29.0`, `sqlalchemy>=2.0.31`, `alembic==1.13.1`, `pytest>=8.0`, `pytest-cov>=5.0` 등을, 프런트는 `next==14.2.3`, `react==18.3.1`, `swr==2.2.5`, `vitest==2.1.8`, `@testing-library/react==16.1.0` 등을 사용한다. fileciteturn86file0L1-L1 fileciteturn87file0L1-L1 fileciteturn77file0L1-L1 fileciteturn85file0L1-L1

README는 이 프로젝트를 “경량 MES 프로토타입”으로 소개하지만 저장소 이름은 ERP이고, `main.py`의 앱 타이틀과 루트 응답 역시 여전히 “MES” 명칭을 쓴다. 이 명명 불일치는 단순 브랜딩 문제가 아니라, 과거 설계의 일부 흔적이 아직 문서와 코드 곳곳에 남아 있음을 시사한다. 실제로 2026년 4월 말 커밋들은 “공정코드 18개 단일화”, “category 제거 이후 문서 갱신”, “DB 재생성(722건)”을 반복적으로 언급한다. 즉 현재 저장소는 상당히 빠른 구조 정리 단계에 있다. fileciteturn86file0L1-L1 fileciteturn79file0L1-L1

아래 비교표는 README, 아키텍처 문서, requirements/package.json, CI 설정, Docker/NAS 배포 정의를 종합한 것이다. fileciteturn86file0L1-L1 fileciteturn87file0L1-L1 fileciteturn77file0L1-L1 fileciteturn85file0L1-L1 fileciteturn88file0L1-L1 fileciteturn61file0L1-L1
```
