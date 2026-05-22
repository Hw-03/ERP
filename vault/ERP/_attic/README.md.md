---
type: file-explanation
source_path: "_attic/README.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# README.md — README.md 설명

## 이 파일은 무엇을 책임지나

`README.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_attic/`
- `Current Split`
- `Development Baselines`

## 연결되는 파일

- [[ERP/_attic/📁__attic]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# _attic/

`_attic/` is the repository's archive area for files that are not required for
app runtime or the current development verification flow.

Keep runtime files out of this folder. In particular:

- `backend/erp.db` stays in `backend/`.
- `backend/data/audit_csv/` stays in `backend/data/`.
- Development baselines stay in `_dev/baselines/`.

## Current Split

- `_attic/data/`: raw spreadsheets, extracted image sources, old DB snapshots.
- `_attic/docs/`: old plans, reviews, presentations, regression screenshots.
- `_attic/ai/`: AI handoff and progress notes that are not active runtime inputs.
- `_attic/vault/`: local/personal vault material.

## Development Baselines

`openapi.json` is not stored here anymore because CI and local verification use
it while development is still active.

Current location:

```text
_dev/baselines/openapi.json
```

If the API schema intentionally changes, regenerate that baseline and commit the
updated file with the code change.
```
