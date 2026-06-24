# 📁 _warehouse_map_sections

## 이 폴더는 뭐예요?

창고 지도 탭(`DesktopWarehouseMapView`)의 UI 섹션입니다. 앵글(선반 구획)·박스 배치를 시각화하고 편집합니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `WarehouseJariPanel.tsx` | 창고 지도 메인 패널 (앵글·박스 레이아웃) |
| `JariColumn.tsx` | 앵글 열(column) 렌더링 |
| `WarehouseStages.tsx` | 창고 구역별 스테이지 |
| `AddBoxScreen.tsx` | 박스 추가 화면 |
| `warehouseMap.module.css` | 지도 전용 CSS 모듈 |

## 언제 여기를 보나요?

- 창고 지도 UI 레이아웃이나 박스 표시가 이상할 때
- 앵글/박스 편집 기능을 수정할 때

## 건드릴 때 조심할 점

- "구획" = "앵글". "선반"이라는 용어는 사용 금지 (용어 정책)

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py.md]] — 지도 데이터 조립 서비스
- [[ERP/backend/app/routers/warehouse_map/angles.py.md]] — 앵글 CRUD API
- [[ERP/backend/app/routers/warehouse_map/boxes.py.md]] — 박스 CRUD API
