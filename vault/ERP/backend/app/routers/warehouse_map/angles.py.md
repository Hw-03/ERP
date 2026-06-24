# angles.py

## 이 파일은 뭐예요?

창고 지도의 **앵글(구획)** CRUD API입니다. 창고 정/부 관리자 PIN이 필요합니다.

"앵글"은 창고 내 선반 구획을 의미합니다. "선반"이라는 용어 사용 금지.

## 엔드포인트

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/api/warehouse-map/angles` | 앵글 목록 조회 |
| POST | `/api/warehouse-map/angles` | 앵글 생성 |
| PUT | `/api/warehouse-map/angles/{id}` | 앵글 수정 |
| DELETE | `/api/warehouse-map/angles/{id}` | 앵글 삭제 |
| PUT | `/api/warehouse-map/angles/reorder` | 앵글 순서 일괄 변경 |

## 언제 보나요?

- 창고 지도 앵글 추가·수정·삭제가 안 될 때
- 앵글 순서 변경이 저장 안 될 때

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py.md]] — 지도 데이터 조립
- [[ERP/backend/app/services/reorder.py.md]] — 순서 재정렬 서비스
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/📁__warehouse_map_sections.md]] — 편집 UI
