"""입출고 탭 2.0 orchestration service.

This layer keeps the new UX context (bundle/auto lines/excluded lines) while
delegating actual stock movement to the existing inventory and stock request
services.

구현은 책임별 서브모듈로 분리됨:
  io_preview   — 라우팅 규칙 + BOM 묶음 전개 + 라인 생성 (preview)
  io_persist   — 배치 영속화 + 응답 페이로드 + 외부 결재 상태 동기화
  io_draft     — 임시저장 CRUD + 멱등 재제출 응답
  io_dispatch  — 제출 분기(창고/부서 결재·즉시) + 실재고 반영 + 로그

이 모듈은 하위 호환성을 위한 re-export 레이어이며,
라우터/서비스는 `from app.services import io as io_svc` 패턴을 그대로 사용한다.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# re-export: io_preview
# ---------------------------------------------------------------------------
from app.services.io_preview import (  # noqa: F401
    APPROVAL_SUB_TYPES,
    MANUAL_LINE_ORIGINS,
    WORK_TYPES,
    preview,
)

# ---------------------------------------------------------------------------
# re-export: io_persist
# ---------------------------------------------------------------------------
from app.services.io_persist import (  # noqa: F401
    get_batch,
    sync_batch_from_stock_request,
)

# ---------------------------------------------------------------------------
# re-export: io_draft
# ---------------------------------------------------------------------------
from app.services.io_draft import (  # noqa: F401
    build_idempotent_response,
    delete_draft,
    find_by_client_request_id,
    get_draft,
    list_drafts,
    save_draft,
)

# ---------------------------------------------------------------------------
# re-export: io_dispatch
# ---------------------------------------------------------------------------
from app.services.io_dispatch import (  # noqa: F401
    execute_batch_after_dept_approval,
    submit,
    submit_existing_draft,
)
