# 품질개선 및 오늘 작업 보존

이 브랜치는 품질개선 이후 코드와 2026-09-14 오늘의 작업 상태를 잃지 않기 위한 보존본이다.
검증 완료 릴리스로 간주하지 않는다. 모든 미커밋 변경을 원래 작성 상태로 보존하며, 기존 결함을 여기서 수정하지 않는다.

- 원래 HEAD: `a0cf0809f7ac3cb0739ce177e29fb04028080a0e`.
- 보존 기준: 2026-09-14 12:29 KST, 미커밋·미추적 106개 항목.
- 브랜치: `codex/quality-preserved-20260914`.
- 워크트리: `C:\ERP\.worktrees\quality-preserved-20260914`.
- 바이트 단위 원본, 해시 목록, Git bundle, 변경 패치: `C:\ERP\_attic\runtime\rollback-pre-quality-20260914\preservation`.
- 직원 DB·로그·비밀 설정은 별도 로컬 백업에만 있으며 Git에 포함하지 않는다.
- 직원 DB의 오늘 수정·취소 결과는 복원 대상 코드와 독립적으로 유지한다.
- 현재 미커밋 수정의 검증 상태는 보존 단계의 검사 로그에 기록하며, 실패하더라도 검사를 통과한 것처럼 표기하지 않는다.

## 보존 검증 (2026-09-14)

- 원본 manifest의 모든 파일을 워크트리와 SHA-256 대조: 통과.
- 기존 Git 이력 bundle 검증: 통과.
- `git diff --cached --check`: 통과.
- `npm ci --no-audit --no-fund`: 통과.
- 필수 `verify_local.ps1 -Mode smart -ChangeSet staged` 실행: **미통과**.
  Ruff와 mypy baseline은 통과했으나 `TEST_POSTGRES_URL`이 설정되지 않아 PostgreSQL 경합 검사가 `NOT_VERIFIED`로 중단됐다. 이후 게이트는 실행되지 않았다.
- 로그: `C:\ERP\_attic\runtime\rollback-pre-quality-20260914\preservation-gate.log`.
- 이 커밋은 검사 통과 릴리스가 아닌, 사용자 요청에 따른 **미검증 작업 보존 체크포인트**다. 메인 병합·직원 배포 대상으로 승인된 것이 아니다.
- 기존 skip-worktree 감사 CSV의 로컬 차이는 Git에 추가하지 않았다. 해당 바이트도 원본 로컬 snapshot에 별도 보존했다.
