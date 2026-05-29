# ADR-0004 — OpenAPI baseline 은 `_dev/baselines/openapi.json`

**상태**: Accepted (2026-05-29)

## 맥락

CI workflow (`.github/workflows/ci.yml:37-53`) 가 백엔드 OpenAPI 스펙의 drift 를
검사한다. 비교 기준 파일(baseline)은 한때 `docs/openapi.json` 이었으나 어느 시점에
`_dev/baselines/openapi.json` 으로 이동되었다.

README 와 일부 문서(`ARCHITECTURE.md` 등)는 한동안 옛 경로(`docs/openapi.json`)를
가리켜 신규 개발자가 "baseline 파일이 없네?" 라고 혼동하는 사례가 발생했다.
외부 리뷰(2026-05-29)도 잘못된 경로(`_attic/docs/openapi.json`)를 지목.

## 결정

**OpenAPI baseline 의 정식 경로는 `_dev/baselines/openapi.json`.**

- CI drift gate 는 위 경로의 파일과 `app.openapi()` 출력을 diff.
- baseline 재생성 명령은 README "API 변경 시 OpenAPI baseline 갱신" 섹션에 명시:

  ```bash
  cd backend
  python -c "from app.main import app; import json; \
    open('../_dev/baselines/openapi.json','w',encoding='utf-8').write(\
    json.dumps(app.openapi(),indent=2,sort_keys=True,ensure_ascii=False)+chr(10))"
  ```

- 백엔드 schema 변경 PR 은 baseline 재생성 결과를 같은 commit 에 포함시켜야 CI 통과.

## 결과

**좋은 점**
- 한 경로에 정렬 — 검색/온보딩 마찰 제거.
- ADR 이 변경 이력 자체가 됨.

**나쁜 점 / 주의**
- 옛 docs 가 어딘가에 남아 있을 수 있음 → grep 으로 잔존 링크 주기적 점검.
- baseline 갱신을 잊으면 CI 가 즉시 실패 — 의도된 안전망이지만 익숙해질 때까지 마찰.

## 관련

- `.github/workflows/ci.yml`
- `README.md` 의 "API 변경 시 OpenAPI baseline 갱신" 섹션
- `_dev/baselines/openapi.json`
