---
type: file-explanation
source_path: "_attic/scripts/dev/bundle_readme_ko.txt"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bundle_readme_ko.txt — bundle_readme_ko.txt 설명

## 이 파일은 무엇을 책임지나

`bundle_readme_ko.txt`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```text
DEXCOWIN MES - 담당자 실행 안내
================================

1. 이 폴더를 통째로 원하는 위치(예: 바탕화면)에 둡니다.
2. RUN.bat 를 더블클릭합니다.
   - 검은 창 2개(Backend/Frontend)가 뜨고 잠시 후 브라우저가 자동으로 열립니다.
   - 안 열리면 브라우저에서 직접 주소창에:
       http://localhost:3000/legacy?tab=admin
3. 관리자 → BOM 메뉴에서 작업합니다. 작업은 자동으로 저장됩니다.
4. 종료: 검은 창 2개를 닫으면 됩니다.

[중요]
- Python / Node 설치 불필요 (폴더 안에 포함). 인터넷 없어도 실행됩니다.
- 작업 결과는  app\backend\erp.db  파일에 저장됩니다.
  작업이 끝나면 이 erp.db 파일 하나만 회수하면 됩니다. (JSON 아님)
- 처음 켤 때 Windows 보안경고가 뜨면 "추가 정보 -> 실행" 을 누르세요.
- 포트 3000 / 8010 을 다른 프로그램이 쓰고 있으면 충돌할 수 있습니다.
- 첫 기동은 10~20초 걸릴 수 있습니다. 창을 닫지 말고 기다리세요.
```
