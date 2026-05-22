---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/ONBOARDING.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# ONBOARDING.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/ONBOARDING.md]]

## 원본 첫 줄 (또는 메타)

```
# 신규 인원 온보딩 (DEXCOWIN MES)

이 문서는 처음 MES 프로젝트를 받는 운영자/개발자가 **1시간 안에 첫 작업까지** 도달하기 위한 절차를 정리한다.

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
```
