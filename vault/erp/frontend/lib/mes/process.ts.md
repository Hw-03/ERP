---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/process.ts
tags: [vault, code-note, b-tier]
---

# process.ts — 공정(Process Stage) 모듈

> [!summary] 역할
> 품목코드 process_type (TR/TA/TF/HR/...) → 라벨/부서명 static 매핑. DB 정규화와 무관한 코드 기반 매핑.

## 1. 이 파일의 역할
- PROCESS_LABEL: 18개 공정 코드 → 영문 라벨 매핑 (TR="Tube Raw", TA="Tube Ass'y" 등)
- processStageLabel(code?) — 빈 입력="-", 미매핑=입력 그대로, 아니면 라벨 반환
- PROCESS_TO_DEPT: 공정 코드 → 부서명 (TR/TA/TF="튜브", HR/HA/HF="고압" 등)
- itemCodeDept(code) — 품목코드의 첫 글자 → 부서명

## 2. 실제 원본 위치
`frontend/lib/mes/process.ts` — 약 80줄

## 3. 주요 import
없음 (순수 상수/함수)

## 4. 어디서 쓰이는지
- Item 상세보기: 공정 단계 표시 (Tube Raw vs Tube Ass'y)
- 부서 필터링 (공정 코드 → 부서명)
- 품목코드 파싱 (2번째 segment)

## 5. ⚠️ 위험 포인트
- **PROCESS_LABEL과 PROCESS_TO_DEPT 불일치 가능** — 새 공정 추가 시 둘 다 수정 필수
- 품목코드에 첫 글자만 보고 부서 판별 — "T"면 무조건 "튜브" (품목코드 형식 의존)
- 미매핑 코드는 그대로 반환 — UI에서 처리 필요

## 6. 수정 전 체크
- processStageLabel("TR") === "Tube Raw" 확인
- processStageLabel(null) === "-" 확인
- PROCESS_TO_DEPT["TR"] === "튜브" 확인
