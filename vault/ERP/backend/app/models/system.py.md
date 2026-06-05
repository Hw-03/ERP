---
type: file-explanation
source_path: "backend/app/models/system.py"
importance: normal
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# system.py — 시스템 설정 키-값 표

## 이 파일은 무엇을 책임지나

시스템 전역 설정을 키-값 형태로 저장하는 표(SystemSetting) 를 정의합니다.

## 업무 흐름에서의 의미

특정 화면에 묶이지 않는 전역 설정값(키 → 값 문자열)을 한곳에 보관합니다. 설정이 바뀐 시각도 함께 남깁니다.

## 언제 보면 좋나

- 시스템 전역 설정이 어디 저장되는지 확인할 때

## 중요한 내용

- `SystemSetting` — `setting_key`(기본키)·`setting_value`(문자열)·`updated_at`. 값은 문자열이라 필요 시 코드에서 해석합니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 모델 패키지 개요.

## 핵심 발췌

```python
setting_key = Column(String(100), primary_key=True)
setting_value = Column(Text, nullable=False)
```
