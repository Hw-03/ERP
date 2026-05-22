---
type: file-explanation
source_path: "_dev/baselines/openapi.json"
importance: normal
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# openapi.json — openapi.json 설명

## 이 파일은 무엇을 책임지나

`openapi.json`는 JSON 설정/데이터입니다. 프로젝트 구조 안에서 `_dev/baselines/openapi.json` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

프로젝트 운영과 개발을 이해하기 위한 보조 정보입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_dev/baselines/📁_baselines]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```json
{
  "components": {
    "schemas": {
      "AdjLineInput": {
        "properties": {
          "bom_expected": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "pattern": "^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Bom Expected"
          },
          "department": {
            "title": "Department",
            "type": "string"
          },
          "direction": {
            "enum": [
              "in",
              "out",
              "defective",
              "scrap"
            ],
            "title": "Direction",
            "type": "string"
          },
          "item_id": {
            "format": "uuid",
            "title": "Item Id",
            "type": "string"
          },
          "quantity": {
            "anyOf": [
              {
                "exclusiveMinimum": 0.0,
                "type": "number"
              },
              {
                "pattern": "^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d*$",
                "type": "string"
              }
            ],
            "title": "Quantity"
          },
          "reason": {
            "anyOf": [
              {
```
