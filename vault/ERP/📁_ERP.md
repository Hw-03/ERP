---
aliases: ["DEXCOWIN MES Vault", "Vault 루트", "인수인계 허브"]
type: meta
project: DEXCOWIN MES
updated: 2026-05-22
---

# 📁 ERP — DEXCOWIN MES

이 폴더(`vault/ERP/`)는 프로젝트 루트의 **탐색 가능한 미러**입니다.
실제 코드는 `C:\ERP\`에 있고, 이 폴더는 그 구조를 Obsidian에서 읽을 수 있게 재현한 것입니다.

> **코드가 정답입니다.** 이 노트와 코드가 다르면 코드를 믿으세요.

## 어떻게 시작하나요?

| 순서 | 파일 | 목적 |
|------|------|------|
| 1 | [[guides/처음_읽는_사람]] | Vault 전체 안내 (10분) |
| 2 | [[guides/전체_컨텍스트]] | 시스템 전체 구조 이해 |
| 3 | [[guides/위험지대_지도]] | 건드리면 위험한 곳 |
| 4 | [[guides/용어사전]] | 모르는 용어 확인 |

## 폴더 구조

- `backend/` — FastAPI 백엔드 (Python)
- `frontend/` — Next.js 14 프론트엔드 (TypeScript)
- `docs/` — 설계 문서, 운영 가이드
- `scripts/` — 개발/운영/마이그레이션 스크립트
- `data/` — 데이터 파일
- `docker/` — Docker 설정
- `_attic/` — 아카이브 (수정 금지)
- `_dev/` — 개발용 베이스라인

## 브랜치 정책

- `main` — 코드만 (vault/ 없음)
- `vault-sync` — 코드 + vault/ (이 브랜치)

`main`에 vault를 절대 커밋하지 않는다.
