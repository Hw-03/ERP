# model-labels.ts

## 이 파일은 뭐예요?
백엔드가 보내는 모델 식별자(`model_symbol`: "3", "4", "6", "7", "8" 등)를 사용자에게 보여줄 표시명("DX3000", "ADX4000W" 등)으로 변환하는 매핑 테이블과 변환 함수를 제공합니다.

## 언제 보나요?
- 생산 가능 수량(capacity) 화면에서 모델명 칩/헤더를 표시할 때
- 모델 식별자가 숫자 코드로 내려오고 이를 사람이 읽을 수 있는 이름으로 바꿔야 할 때

## 중요한 내용
- `MODEL_DISPLAY_NAME` — model_symbol → 표시명 상수 테이블 (`"3"→"DX3000"`, `"4"→"ADX4000W"`, `"6"→"ADX6000FB"`, `"7"→"COCOON"`, `"8"→"SOLO"`, `"9"→"신제품"`)
- `getModelLabel(modelSymbol, pfName?)` — model_symbol 우선 조회, 없으면 pfName 첫 토큰(언더스코어/쉼표 앞)을 fallback으로 사용. 둘 다 비면 빈 문자열 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/capacity.ts]] — `getModelLabel`을 import해 모델 그룹 레이블 생성에 사용
