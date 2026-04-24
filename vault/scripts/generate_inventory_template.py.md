---
type: code-note
project: ERP
layer: scripts
source_path: scripts/generate_inventory_template.py
status: active
tags:
  - erp
  - scripts
  - excel
  - template
aliases:
  - 재고 입력 양식 생성기
---

# generate_inventory_template.py

> [!summary] 역할
> 실제 재고 데이터를 입력하기 위한 **엑셀 양식 파일**(`data/재고_입력_양식.xlsx`)을 생성하는 스크립트.

> [!info] 생성되는 엑셀 파일 구조
> - **Sheet1 "재고입력"**: 12컬럼 입력표 + 드롭다운 유효성 검사 + 예시 3행
> - **Sheet2 "작성가이드"**: 카테고리/모델 설명, 작성 규칙

> [!info] 주요 기능
> - 카테고리 드롭다운 (RM, BA, BF, HA, HF, VA, VF, TA, TF, FG)
> - 서식, 테두리, 색상 자동 적용 (`openpyxl`)
> - 예시 행 3개 포함

## 실행 방법

```bash
py scripts/generate_inventory_template.py
```

---

## 쉬운 말로 설명

**담당자에게 나눠줄 재고 입력 엑셀 파일을 자동으로 만들어주는 스크립트**. 드롭다운, 예시 행, 가이드 시트까지 다 세팅된 `xlsx` 를 단 한 번의 실행으로 생성.

흐름:
1. 스크립트 실행 → `data/재고_입력_양식.xlsx` 생성
2. 이 파일을 담당자들에게 배포 (카톡/이메일)
3. 담당자가 실제 재고 수량 입력 후 반납
4. `import_real_inventory.py` 로 DB 반영

## 12컬럼 구조 (Sheet1)

| 컬럼 | 설명 | 예시 |
|------|------|------|
| 품번 | ERP 코드 또는 공란 | `3-AR-0001` |
| 품명 | 필수 | `메인보드 Type-A` |
| 규격 | 옵션 | `PCB 150x120` |
| 단위 | EA/KG/L 등 | EA |
| 카테고리 | 드롭다운 | RM |
| 창고재고 | 숫자 | 120 |
| ... | ... | ... |

## FAQ

**Q. 드롭다운이 안 보이는 엑셀 뷰어?**
카카오톡 PC 뷰어, 구글시트에서 `openpyxl` 유효성검사가 부분 지원. MS Excel 또는 LibreOffice 권장.

**Q. 예시 행은 삭제하고 입력?**
YES. `import_real_inventory.py` 는 품명이 "예시/Example" 포함된 행은 건너뛰긴 하지만 삭제가 안전.

**Q. 양식 양식 커스터마이즈?**
이 스크립트 수정 후 재생성. 컬럼 추가 시 `import_real_inventory.py` 매핑도 같이 수정 필요.

---

## 관련 문서

- [[scripts/import_real_inventory.py.md]] — 이 양식으로 입력한 데이터를 DB에 반영
- [[data/data]] — 생성된 양식 파일 위치

Up: [[scripts/scripts]]
