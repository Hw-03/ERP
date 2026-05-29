# Architecture Decision Records (ADR)

이 디렉터리는 DEXCOWIN MES 의 주요 아키텍처/도메인 결정을 기록한다.
"왜 그렇게 만들었는가" 를 미래의 우리(또는 새 팀원, AI)가 다시 묻지 않도록 한 곳에 모은다.

## 형식

자유 형식. 다음 4 섹션을 포함한다:
1. **상태** — Proposed / Accepted / Superseded by ADR-XXXX
2. **맥락** — 어떤 문제·제약·관찰이 이 결정을 강제했는가
3. **결정** — 무엇을 어떻게 하기로 했는가
4. **결과** — 무엇이 좋아지고 무엇이 나빠지는가, 어디에 영향이 가는가

## 목록

- [ADR-0001 — IoCompose V2 의 work type 은 4개](ADR-0001-io-compose-v2-work-types.md)
- [ADR-0002 — 출입고 도메인 단일 사전 (glossary.ts)](ADR-0002-shared-io-glossary.md)
- [ADR-0003 — Mobile wizard 는 Desktop V2 컴포넌트를 재사용](ADR-0003-mobile-reuses-desktop-v2.md)
- [ADR-0004 — OpenAPI baseline 은 `_dev/baselines/openapi.json`](ADR-0004-openapi-baseline-location.md)

## 새 ADR 작성 시

- 파일명: `ADR-NNNN-짧은-제목.md` (4자리 일련번호, kebab-case)
- 본 README 의 목록에 추가
- 결정을 뒤집을 때는 새 ADR 을 만들고 이전 ADR 의 상태를 `Superseded by ADR-XXXX` 로 갱신
