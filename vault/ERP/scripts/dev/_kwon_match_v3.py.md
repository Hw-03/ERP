---
type: file-explanation
source_path: "scripts/dev/_kwon_match_v3.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _kwon_match_v3.py — _kwon_match_v3.py 설명

## 이 파일은 무엇을 책임지나

`_kwon_match_v3.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `norm`
- `strip_brackets`
- `norm_loose`
- `get_tokens`
- `gen_kwon_variants`
- `models_match`
- `pick_best`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""권동환 파일 매칭 v3 — 마스터 F+G + 토큰 자카드 점수"""
import openpyxl, re
from collections import defaultdict

KWON = r'_attic/data/0520 권동환 사원님 재고/F704-03 (R00) 자재 재고 현황_통합.xlsx'
MATCH = r'_attic/data/생산부_재고_매칭작업_최종.bak_memo13_20260518_101641.xlsx'

wb_k = openpyxl.load_workbook(KWON, data_only=True)
wb_m = openpyxl.load_workbook(MATCH, data_only=True)
ws_k = wb_k['26.05월_수정본']
ws_master = wb_m['마스터_품목']


def norm(s):
    if s is None: return ''
    return re.sub(r'\s+', ' ', str(s).strip()).lower()


def strip_brackets(s):
    return re.sub(r'\[...\]', '', str(s)).strip()


def norm_loose(s):
    if s is None: return ''
    s = re.sub(r'[_]+', ' ', str(s))
    s = re.sub(r'\s+', ' ', s)
    return s.strip().lower()


def get_tokens(s):
    if s is None: return set()
    parts = re.findall(r'[A-Za-z0-9가-힣]{2,}', str(s))
    return set(p.lower() for p in parts)


# 마스터 행
master_rows = []
for r in range(2, ws_master.max_row + 1):
    f = ws_master.cell(row=r, column=6).value
    g = ws_master.cell(row=r, column=7).value
    k = ws_master.cell(row=r, column=11).value
    mes = ws_master.cell(row=r, column=16).value
    model = ws_master.cell(row=r, column=3).value
    g_clean = strip_brackets(g) if g else ''
    mt = ''
    if g:
        m = re.search(r'\[([^\]]+)\]', str(g))
        if m: mt = m.group(1)
    if not mt and model: mt = str(model)
    master_rows.append((r, f, g, g_clean, mt, k, mes))

# 부서별 시트
extras = []
for sn in ['튜브파트_재고현황', '고압진공_재고현황', '조립자재_재고현황', '조립완제품_재고현황', '출하_재고현황']:
    ws = wb_m[sn]
```
