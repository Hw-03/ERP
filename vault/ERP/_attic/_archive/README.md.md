---
type: file-explanation
source_path: "_attic/_archive/README.md"
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

- `Archive`

## 연결되는 파일

- [[ERP/_attic/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
## Archive

This folder keeps reference assets and files that are not part of the active app/runtime path.

Current contents:
- `reference/files.zip`: original UI reference bundle kept for design comparison only.

Rules:
- Do not import from this folder in production code without reviewing ownership first.
- Prefer moving old snapshots here instead of deleting them when they may still be useful for comparison.
```
