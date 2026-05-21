---
type: code-note
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-04-27
updated: 2026-05-21
tags:
  - vault
  - meta
  - root
  - mirror
  - rules
  - layer/meta
  - topic/root
aliases:
  - CLAUDE 규칙 미러
  - AI 작업 규칙
source_path: erp/CLAUDE.md
---

# CLAUDE.md (코드 미러)

> [!summary] 역할
> 이 노트는 `erp/CLAUDE.md` 의 핵심 규칙을 **왜 지켜야 하는지** 까지 풀어 쓴 분석 지도다.

> [!warning] 원본 위치
> 실제 규칙 수정은 원본에서만 한다.
> - 원본: `erp/CLAUDE.md`
> - 이 미러: `erp/vault/CLAUDE.md.md`

---

## 1. 이름 규칙

> [!warning] DEXCOWIN MES
> 사용자 노출 텍스트·문서에서 시스템 이름은 **DEXCOWIN MES** 다.
> "ERP" / "X-Ray ERP" 는 옛 호칭. UI·발표자료에선 쓰지 마라.

> [!info] 단, legacy 식별자는 손대지 마라
> - 폴더명 `erp/` → 그대로
> - DB 컬럼 `erp_code`, 내부 식별자 `xray-erp` → 그대로
> - 임의로 rename 하면 마이그레이션·CI 가 깨진다.

---

## 2. 경로

- backend: `erp/backend/`
- frontend: `erp/frontend/`
- backend entry: `erp/backend/app/main.py`
- 프론트 수정 전에는 **실제 render/import 경로부터 확인**

> [!tip] 왜 이 규칙이 있나
> AI 가 쓴 코드는 "있어 보이는데 실제로는 import 되지 않는" 컴포넌트가 많다. 화면을 고쳤는데 안 바뀌면 거의 이 함정이다.

---

## 3. 손대지 말 폴더

> [!warning] 명시 지시 없이는 금지
> - `_archive/`
> - `_backup/`
> - `frontend/_archive/`
> - `_attic/` (보관용 — 가볍게 정리하지 마라)

> [!question] 왜?
> 옛 정답이 보존돼 있어서, 현재 코드가 무너졌을 때 비교·복구 기준이 된다. 마음대로 정리하면 그 기준이 사라진다.

---

## 4. 문서 vs 코드

> [!quote] 코드가 정답
> "If docs and live code disagree, trust the live code."

문서를 먼저 믿지 마라. 옛 문서를 따라 코드를 바꾸면 멀쩡한 동작을 깬다.

---

## 5. 커밋 / 푸시

> [!warning] 자동 금지
> - 자동 commit 금지
> - 자동 push 금지
> - 사용자가 명시적으로 요청할 때만 진행
> - 명시 지시가 없으면 **이번 세션에서 만진 파일만** 커밋

> [!tip] 커밋 직전 5게이트
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
> ```
> CI 와 동일 기준으로 검증. CI 빨간불을 PC 에서 미리 잡는다.

---

## 6. DB / 서버 실행

> [!warning] 서버 기동이 DB 를 바꿔선 안 된다
> 스키마/시드/마이그레이션 작업은 명시적 명령으로만:
> ```bash
> cd erp/backend
> python bootstrap_db.py --all
> ```
> 그리고 DB 영향은 사용자에게 **먼저 보고** 후 진행.

백엔드 실행:
```bash
cd erp/backend
python -m uvicorn app.main:app --reload
```

---

## 7. AI 작업 4대 행동 원칙 (원본 후반)

> [!info] LLM 행동 가이드
> 원본 `erp/CLAUDE.md` 후반의 LLM 행동 가이드. AI 와 페어로 작업할 때 그대로 적용된다.

1. **Think Before Coding** — 가정을 명시. 모호하면 묻는다.
2. **Simplicity First** — 요청 외 기능·추상화 금지. 200줄을 50줄로 줄일 수 있으면 줄여라.
3. **Surgical Changes** — 요청 범위만 건드린다. 인접 코드를 "개선"하지 마라.
4. **Goal-Driven Execution** — 성공 기준을 먼저 정한다. "동작하게 만들어"는 약한 기준.

> [!quote] 응답 스타일
> 한국어, 결론 먼저, 짧고 명확하게.

---

## 8. 왜 이 규칙을 따라야 하는지

> [!summary] 배경
> 이 규칙들은 "AI 한 명이 코드를 망친 흔적" 위에 세워졌다. 각 조항마다 실제 사고가 있었다.

- 자동 커밋 금지 → 한 번 잘못 머지된 vault 가 main PR 을 진흙탕으로 만든 전례가 있다.
- DB 자동 변경 금지 → 서버 재기동만으로 스키마가 흔들려 데이터 정합성이 무너진 전례가 있다.
- 코드가 정답 → 옛 문서를 믿고 라우터를 바꿨다가 죽은 엔드포인트를 살린 전례가 있다.
- legacy 식별자 보존 → 임의 rename 으로 CI 가 한나절 빨간불이었던 전례가 있다.

> [!tip] 의심되면
> 원본 `erp/CLAUDE.md` 를 다시 본다. 그래도 모호하면 [[erp/_vault/guides/위험지대_지도]] 와 [[erp/_vault/guides/AI_생성_코드_읽는_법]] 을 본다.

---

Up: [[ERP]]
