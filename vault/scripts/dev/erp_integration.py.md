---
type: code-note
project: ERP
layer: scripts
source_path: scripts/dev/erp_integration.py
status: active
updated: 2026-04-27
source_sha: c362f27e1bd6
tags:
  - erp
  - scripts
  - dev-script
  - py
---

# erp_integration.py

> [!summary] 역할
> 개발 중 데이터 생성, 점검, 로컬 진단을 돕는 보조 스크립트다.

## 원본 위치

- Source: `scripts/dev/erp_integration.py`
- Layer: `scripts`
- Kind: `dev-script`
- Size: `42808` bytes

## 연결

- Parent hub: [[scripts/dev/dev|scripts/dev]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

> 전체 1120줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""
ERP 자재 마스터 DB 통합 스크립트
================================

정밀 X-ray 발생 장치 제조사의 4개 공정(튜브/고압/진공/조립) 엑셀 파일을 읽어
단일 표준 마스터 DB (`ERP_Master_DB.csv`)로 통합한다.

입력:
    - 파일 A: F704-03 (R00) 자재 재고 현황.xlsx       (원자재 마스터, Baseline)
    - 파일 B: 2026.03_생산부 자재_조립,출하파트.xlsx   (조립/출하 부서)
    - 파일 C: 2026.03_생산부 자재_고압,진공,튜닝파트.xlsx (고압/진공/튜닝 부서, 튜브 공정 자재 포함)

출력:
    - ERP_Master_DB.csv          : 통합 마스터 (items 테이블)
    - ERP_Source_Links.csv       : 소스-아이템 매핑 (링크 테이블)
    - ERP_Integration_Report.md  : 통합 결과 리포트 (카테고리 분포, 미매핑 리스트)
    - ERP_Excluded_Items.csv     : 비활성(구버전/미사용/사용중) 항목 분리

카테고리 코드:
    RM : 원자재         (파일 A & B/C 모두에 존재)
    AA : 조립 반제품    (파일 B 단독)
    AF : 조립 완제품    (파일 B 단독 & 모델명/ASS'Y 키워드)
    HA : 고압 반제품    (파일 C, 부서=고압)
    HF : 고압 완제품    (파일 C, 부서=고압 & ASS'Y 키워드)
    VA : 진공 반제품    (파일 C, 부서=진공/튜닝)
    VF : 진공 완제품    (파일 C, 부서=진공/튜닝 & ASS'Y 키워드)
    TA : 튜브 반제품    (파일 C, 분류=튜브* 또는 튜브 공정 부품 키워드)
    TF : 튜브 완제품    (파일 C, 분류=튜브/A,SSY 또는 튜브 어셈블리)
    FG : 최종 완제품    (회사 모델명과 동일)

비활성 부서(`구버전`/`미사용`/`사용중`)에 속한 파일 C 항목은 매칭에서 제외하고
ERP_Excluded_Items.csv 에 별도 보관한다 (감사용).

향후 SQL ERP 이관을 전제로 정규화된 스키마로 저장한다.
"""

from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# 경로 & 상수
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

FILE_A = DATA_DIR / "F704-03 (R00) 자재 재고 현황.xlsx"
FILE_B = DATA_DIR / "2026.03_생산부 자재_조립,출하파트.xlsx"
FILE_C = DATA_DIR / "2026.03_생산부 자재_고압,진공,튜닝파트.xlsx"

OUTPUT_MASTER = DATA_DIR / "ERP_Master_DB.csv"
OUTPUT_LINKS = DATA_DIR / "ERP_Source_Links.csv"
OUTPUT_REPORT = DOCS_DIR / "ERP_Integration_Report.md"
OUTPUT_UNMATCHED = DATA_DIR / "ERP_Unmatched_A_Items.csv"
OUTPUT_MAPPING_SAMPLE = DOCS_DIR / "ERP_Mapping_Sample.md"
OUTPUT_EXCLUDED = DATA_DIR / "ERP_Excluded_Items.csv"

# 회사 모델명 (완제품 후보 식별용)
FINAL_MODELS = {
    "DX3000", "DX3000블랙", "DX3000 블랙", "DX3000 화이트",
    "ADX4000", "ADX4000W", "ADX6000",
    "COCOON", "SOLO", "SOLO+", "SOLO_",
    "330N", "330N+",
}

# Ass'y 키워드 (반제품 식별용)
ASSY_KEYWORDS = ["ASS'Y", "ASSY", "ASS`Y", "어셈블리", "어셈", "반제품", "모듈"]

# 비활성 부서 (매칭/마스터 DB에서 분리, ERP_Excluded_Items.csv 로 별도 저장)
INACTIVE_DEPTS = {"구버전", "미사용", "사용중"}

# 튜브 공정 부품 식별 키워드
# 파일 C의 `분류` 컬럼이 '튜브'가 아니라 'BD'/'부품'/'고압보드 A,SSY' 등으로 등록되어 있지만,
# 실제로는 튜브 공정에 들어가는 부품들. 이름 패턴으로 보조 식별.
TUBE_PART_KEYWORDS = [
    "튜브 고정",       # 튜브 고정 보드/지지대 (케소드, 에노드)
    "튜브 하우징",     # 튜브 하우징 파이프
    "하우징 파이프",   # 하우징 파이프 (HDPE, 베이클라이트)
    "하우징용 파이프", # 70KV 튜브 하우징용 파이프
    "고압보드 SMT",    # 튜브용 고압보드 SMT (DXDR-070, D-041, D-0813)
    "고압베어B/D",     # 고압베어 B/D (D-0813 튜브용)
]


# ---------------------------------------------------------------------------
# 정규화 유틸
# ---------------------------------------------------------------------------

def norm_key(name) -> str:
    """매칭용 키: 유니코드 정규화, 소문자, 공백/특수문자 제거."""
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return ""
    s = str(name)
    s = unicodedata.normalize("NFKC", s)
    s = s.lower()
    # 줄바꿈, 공백, 괄호, 대시, 언더스코어, 쉼표, 점, 슬래시 등 제거
    s = re.sub(r"[\s\[\]\(\)_\-\.,/~`\n\r\t＊*:;!?\"'·•‧]+", "", s)
    return s


def clean_text(name) -> str:
    """표시용: 연속 공백 단일화, 앞뒤 공백 제거."""
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return ""
    s = str(name)
    s = s.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def std_name(raw_name, raw_spec="", unit="") -> str:
    """표준 품명 포맷: [품명] [규격] [단위] (특수문자 최소화)."""
    name = clean_text(raw_name)
    spec = clean_text(raw_spec)
    # 괄호 안 내용은 유지하되 [ ] _ 는 공백으로
    name = re.sub(r"[\[\]_]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()

    spec = re.sub(r"[\[\]_]+", " ", spec)
    spec = re.sub(r"\s+", " ", spec).strip()

    parts = [p for p in [name, spec, clean_text(unit)] if p and p.lower() != "nan"]
    return " ".join(parts)


def extract_spec_from_name(name: str) -> str:
    """품목명 내의 [규격] 또는 _규격 패턴에서 규격 추출."""
    if not name:
        return ""
    specs = []
    # [...] 패턴
    specs.extend(re.findall(r"\[([^\]]+)\]", str(name)))
    # _XXX 패턴 (끝 또는 공백 전까지)
    tail = re.findall(r"_\s*([^\s\[\]]+)", str(name))
    specs.extend(tail)
    return " ".join(s.strip() for s in specs if s.strip())


# ---------------------------------------------------------------------------
# 데이터 로딩
# ---------------------------------------------------------------------------

def load_file_a() -> pd.DataFrame:
    """파일 A (원자재 마스터) 로드."""
    df = pd.read_excel(FILE_A, sheet_name="26.03월", header=2)
    df.columns = [str(c).replace("\n", "").strip() for c in df.columns]

    # 품명이 있는 행만 유지
    df = df[df["품명"].notna() & (df["품명"].astype(str).str.strip() != "")].copy()

    df["_source_file"] = "A"
    df["_source_sheet"] = "26.03월"
    df["_source_row"] = df.index + 4  # 엑셀 실제 행번호 (header=2, 0-indexed → +4)
    df = df.reset_index(drop=True)
    return df


def load_file_b() -> pd.DataFrame:
    """파일 B (조립/출하) 로드 + 카테고리 forward-fill."""
    df = pd.read_excel(FILE_B, sheet_name="조립 자재", header=1)

    # 컬럼 정리: '품 목' (카테고리), '품 목.1' (상세), '모델'
    rename = {
        "품 목": "category_group",
        "품 목.1": "item_name",
        "모델": "model",
    }
    df = df.rename(columns=rename)

    # 카테고리(그룹) forward-fill (병합 셀)
    if "category_group" in df.columns:
        df["category_group"] = df["category_group"].ffill()

    # item_name이 있는 행만 유지
    df = df[df["item_name"].notna() & (df["item_name"].astype(str).str.strip() != "")].copy()

    df["_source_file"] = "B"
    df["_source_sheet"] = "조립 자재"
    df["_source_row"] = df.index + 3
    df = df.reset_index(drop=True)
    return df


def load_file_c() -> tuple[pd.DataFrame, pd.DataFrame]:
    """파일 C (고압/진공/튜닝) 로드 + 부서/분류 forward-fill.

    Returns:
        (df_active, df_excluded) 튜플:
            - df_active: 매칭/마스터 대상 (부서 = 고압/진공/튜닝)
            - df_excluded: 비활성 (부서 = 구버전/미사용/사용중) → ERP_Excluded_Items.csv
    """
    df = pd.read_excel(FILE_C, sheet_name="고압", header=1)

    # 첫 컬럼은 번호 (빈 헤더)
    first_col = df.columns[0]
    df = df.rename(columns={
        first_col: "seq_no",
        "부서": "department",
        "분류": "sub_class",
        "모델": "model",
        "품목": "item_name",
    })

    # 부서/분류 forward-fill (병합 셀)
    for col in ("department", "sub_class"):
        if col in df.columns:
            df[col] = df[col].ffill()

    # 품목이 있는 행만 유지
    df = df[df["item_name"].notna() & (df["item_name"].astype(str).str.strip() != "")].copy()

    # 원본 엑셀 행번호 부여 (active/excluded 분리 전)
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
