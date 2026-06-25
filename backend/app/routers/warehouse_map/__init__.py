"""창고 지도 라우터 패키지.

`from app.routers import warehouse_map` + `app.include_router(warehouse_map.router, ...)`.

서브 모듈:
- query  — /structure, /map, /reconcile, /jari (공개 GET)
- angles — 앵글 CRUD (admin PIN)  — 구조 편집
- boxes  — 박스 CRUD (admin PIN)  — 위치 배정
"""

from fastapi import APIRouter

from . import angles, boxes, query, zones

router = APIRouter()

# 정적/특정 경로(/angles/reorder)를 동적(/angles/{id}) 보다 먼저.
router.include_router(query.router)
router.include_router(angles.router)
router.include_router(boxes.router)
router.include_router(zones.router)

__all__ = ["router"]
