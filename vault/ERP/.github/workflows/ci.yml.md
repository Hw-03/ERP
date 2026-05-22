---
type: file-explanation
source_path: ".github/workflows/ci.yml"
importance: normal
layer: tooling
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ci.yml — ci.yml 설명

## 이 파일은 무엇을 책임지나

`ci.yml`는 YAML 설정입니다. 프로젝트 구조 안에서 `.github/workflows/ci.yml` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

프로젝트 운영과 개발을 이해하기 위한 보조 정보입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/.github/workflows/📁_workflows]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```yaml
name: CI

on:
  push:
    branches: [main, "feat/**", "fix/**", "refactor/**"]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: Backend (pytest + compile + openapi-drift)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"
          cache-dependency-path: backend/requirements.txt

      - name: Install dependencies
        working-directory: backend
        run: pip install -r requirements.txt

      - name: Compile check
        run: python -m compileall backend

      - name: Run pytest
        working-directory: backend
        run: pytest -q

      - name: OpenAPI drift check
        working-directory: backend
        run: |
          python -c "
          import sys, json
          sys.path.insert(0, '.')
          from app.main import app
          with open('/tmp/openapi-current.json', 'w', encoding='utf-8') as f:
              json.dump(app.openapi(), f, indent=2, sort_keys=True, ensure_ascii=False)
              f.write('\n')
          "
          diff -u ../_dev/baselines/openapi.json /tmp/openapi-current.json \
            && echo "[OK] OpenAPI spec matches baseline." \
            || (echo "" && echo "[FAIL] OpenAPI drift detected." \
                && echo "If this schema change is intentional, refresh the baseline and commit it:" \
                && echo "  cd backend && python -c \"from app.main import app; import json; open('../_dev/baselines/openapi.json','w',encoding='utf-8').write(json.dumps(app.open...
                && exit 1)

  frontend:
```
