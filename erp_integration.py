"""
ERP 자재 마스터 DB 통합 스크립트
================================

정밀 X-ray 발생 장치 제조사의 3개 부서별 엑셀 파일을 읽어
단일 표준 마스터 DB (`ERP_Master_DB.csv`)로 통합한다.

입력:
    - 파일 A: F704-03 (R00) 자재 재고 현황.xlsx       (원자재 마스터, Baseline)
    - 파일 B: 2026.03_생산부 자재_조립,출하파트.xlsx   (조립/출하 부서)
    - 파일 C: 2026.03_생산부 자재_고압,진공,튜닝파트.xlsx (고압/진공/튜닝 부서)

출력:
    - ERP_Master_DB.csv          : 통합 마스터 (items 테이블)
    - ERP_Source_Links.csv       : 소스-아이템 매핑 (링크 테이블)
    - ERP_Integration_Report.md  : 통합 결과 리포트 (카테고리 분포, 미매핑 리스트)

카테고리 코드:
    RM : 원자재         (파일 A & B/C 모두에 존재)
    BA : 조립 반제품    (파일 B 단독)
    BF : 조립 완제품    (파일 B 단독 & 모델명/ASS'Y 키워드)
    HA : 고압 반제품    (파일 C, 부서=고압)
    HF : 고압 완제품    (파일 C, 부서=고압 & 모델명 일치)
    VA : 진공 반제품    (파일 C, 부서=진공/튜닝)
    VF : 진공 완제품    (파일 C, 부서=진공/튜닝 & 모델명 일치)
    FG : 최종 완제품    (회사 모델명과 동일)

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

BASE_DIR = Path(__file__).resolve().parent

FILE_A = BASE_DIR / "F704-03 (R00) 자재 재고 현황.xlsx"
FILE_B = BASE_DIR / "2026.03_생산부 자재_조립,출하파트.xlsx"
FILE_C = BASE_DIR / "2026.03_생산부 자재_고압,진공,튜닝파트.xlsx"

OUTPUT_MASTER = BASE_DIR / "ERP_Master_DB.csv"
OUTPUT_LINKS = BASE_DIR / "ERP_Source_Links.csv"
OUTPUT_REPORT = BASE_DIR / "ERP_Integration_Report.md"
OUTPUT_UNMATCHED = BASE_DIR / "ERP_Unmatched_A_Items.csv"
OUTPUT_MAPPING_SAMPLE = BASE_DIR / "ERP_Mapping_Sample.md"

# 회사 모델명 (완제품 후보 식별용)
FINAL_MODELS = {
    "DX3000", "DX3000블랙", "DX3000 블랙", "DX3000 화이트",
    "ADX4000", "ADX4000W", "ADX6000",
    "COCOON", "SOLO", "SOLO+", "SOLO_",
    "330N", "330N+",
}

# Ass'y 키워드 (반제품 식별용)
ASSY_KEYWORDS = ["ASS'Y", "ASSY", "ASS`Y", "어셈블리", "어셈", "반제품", "모듈"]


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


def load_file_c() -> pd.DataFrame:
    """파일 C (고압/진공/튜닝) 로드 + 부서/분류 forward-fill."""
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

    df["_source_file"] = "C"
    df["_source_sheet"] = "고압"
    df["_source_row"] = df.index + 3
    df = df.reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# 매칭 로직 (v2: 토큰 기반, 규격 우선순위 강화)
# ---------------------------------------------------------------------------

# 매칭 시 너무 짧으면 오탐이 많은 키워드 차단
STOPWORDS_NORM = {
    "", "led", "ic", "pcb", "nan", "tube", "box", "can", "pin",
    "bd", "cover", "top", "bottom", "panel", "panel", "ea", "set",
    "pad", "kit", "al", "ppm", "flat", "dip", "type",
}

# 최소 유효 토큰 길이 (2자 이상 한글, 3자 이상 영숫자)
MIN_TOKEN_LEN = 2


def tokenize(text) -> list[str]:
    """텍스트를 의미 있는 토큰 리스트로 분리 (정규화된 소문자)."""
    if text is None or (isinstance(text, float) and pd.isna(text)):
        return []
    s = str(text)
    s = s.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    # 구분자: 공백, 괄호, 대괄호, 쉼표, 슬래시, 플러스, 하이픈, 언더스코어
    parts = re.split(r"[\s\[\]\(\),/\+\-_~`:;!?\"'=&]+", s)
    result = []
    for p in parts:
        n = norm_key(p)
        if not n or n in STOPWORDS_NORM:
            continue
        if len(n) < MIN_TOKEN_LEN:
            continue
        result.append(n)
    return result


def score_match(
    a_name_n: str,
    a_name_tokens: list[str],
    a_spec_n: str,
    a_spec_tokens: list[str],
    a_maker_n: str,
    a_maker_tokens: list[str],
    bc_n: str,
    bc_tokens: set,
) -> int:
    """매칭 점수 계산 v3 (Jaccard 보너스 + 다중 토큰 매칭)."""
    if not bc_n:
        return 0

    score = 0

    # 1. MAKER 품번 전체 매칭 (가장 강력)
    if a_maker_n and len(a_maker_n) >= 3 and a_maker_n in bc_n:
        score += 6

    # 1b. MAKER 품번 토큰 매칭
    for t in a_maker_tokens:
        if len(t) >= 3 and t in bc_n:
            score += 3

    # 2. 규격(spec) 전체 매칭 (강력 - 차별화 신호)
    if a_spec_n and len(a_spec_n) >= 3 and a_spec_n in bc_n:
        score += 5

    # 2b. 규격 토큰 매칭
    for t in a_spec_tokens:
        if len(t) >= 3 and t in bc_n:
            score += 3
        elif len(t) >= 2 and t in bc_n:  # 2자 한글 토큰도 약하게 반영
            score += 1

    # 3. 품명 전체 매칭
    if a_name_n and a_name_n not in STOPWORDS_NORM:
        if len(a_name_n) >= 4 and a_name_n in bc_n:
            score += 3
        elif len(a_name_n) >= 2 and a_name_n in bc_n:
            score += 2

    # 3b. 품명 토큰 매칭 (한글 복합어 대응)
    for t in a_name_tokens:
        if t == a_name_n:
            continue  # 이미 전체 매칭에서 계산됨
        if len(t) >= 4 and t in bc_n:
            score += 2
        elif len(t) >= 2 and t in bc_n:
            score += 1

    # 4. 역방향: 짧은 BC 이름이 A 전체(name+spec+maker)에 포함
    a_full = a_name_n + a_spec_n + a_maker_n
    if len(bc_n) >= 5 and bc_n in a_full:
        score += 2

    # 5. 다중 토큰 매칭 보너스 (Jaccard 유사도 기반)
    #    A의 모든 토큰이 BC와 얼마나 겹치는지
    a_all_tokens = set(a_name_tokens) | set(a_spec_tokens) | set(a_maker_tokens)
    if a_all_tokens and bc_tokens:
        intersection = a_all_tokens & bc_tokens
        inter_len = len(intersection)
        if inter_len >= 3:
            score += 4  # 3개 이상 토큰 공유 = 매우 강함
        elif inter_len == 2:
            # 2개 토큰 중 하나가 4자 이상이면 보너스
            if any(len(t) >= 4 for t in intersection):
                score += 2
            else:
                score += 1

    return score


def build_bc_index(df_b: pd.DataFrame, df_c: pd.DataFrame) -> list[dict]:
    """파일 B+C의 품목을 매칭용 인덱스로 변환 (정규화 키 + 토큰 집합 포함)."""
    index = []

    for i, row in df_b.iterrows():
        raw = str(row["item_name"])
        index.append({
            "file": "B",
            "sheet": "조립 자재",
            "row": row["_source_row"],
            "raw_name": raw,
            "norm": norm_key(raw),
            "tokens": set(tokenize(raw)),
            "model": clean_text(row.get("model", "")),
            "department": "조립",
            "df_index": ("B", i),
        })

    for i, row in df_c.iterrows():
        raw = str(row["item_name"])
        dept = clean_text(row.get("department", ""))
        index.append({
            "file": "C",
            "sheet": "고압",
            "row": row["_source_row"],
            "raw_name": raw,
            "norm": norm_key(raw),
            "tokens": set(tokenize(raw)),
            "model": clean_text(row.get("model", "")),
            "department": dept,
            "df_index": ("C", i),
        })

    return index


def match_a_against_bc(df_a: pd.DataFrame, bc_index: list[dict]) -> tuple[list[dict], set, dict]:
    """
    파일 A의 각 행에 대해 파일 B/C에서 가장 잘 맞는 매칭을 찾는다.
    Returns:
        matches: A 행 → best match 리스트 (dict with a_idx, bc_item, score)
        matched_bc_keys: 매칭된 B/C 항목의 (file, df_idx) 튜플 집합
        bc_match_count: BC 항목 키 → 매핑된 A 개수 (다중 매핑 경고용)
    """
    matches = []
    # (file, idx) -> 매칭된 A 개수
    bc_match_count: dict = {}

    # 매칭 임계값 (v3 점수 스케일)
    SCORE_THRESHOLD = 3

    for a_idx, a_row in df_a.iterrows():
        a_name = clean_text(a_row.get("품명", ""))
        a_spec = clean_text(a_row.get("규격", ""))
        a_maker = clean_text(a_row.get("MAKER품번", ""))

        a_name_n = norm_key(a_name)
        a_spec_n = norm_key(a_spec)
        a_maker_n = norm_key(a_maker)

        a_name_tokens = tokenize(a_name)
        a_spec_tokens = tokenize(a_spec)
        a_maker_tokens = tokenize(a_maker)

        best = None
        best_score = 0

        for bc in bc_index:
            s = score_match(
                a_name_n, a_name_tokens,
                a_spec_n, a_spec_tokens,
                a_maker_n, a_maker_tokens,
                bc["norm"], bc["tokens"],
            )
            if s > best_score:
                best_score = s
                best = bc

        if best and best_score >= SCORE_THRESHOLD:
            matches.append({
                "a_idx": a_idx,
                "bc": best,
                "score": best_score,
            })
            key = best["df_index"]
            bc_match_count[key] = bc_match_count.get(key, 0) + 1
        else:
            matches.append({
                "a_idx": a_idx,
                "bc": None,
                "score": 0,
            })

    matched_bc_keys = set(bc_match_count.keys())
    return matches, matched_bc_keys, bc_match_count


# ---------------------------------------------------------------------------
# 카테고리 분류
# ---------------------------------------------------------------------------

def is_final_model(name: str) -> bool:
    """최종 완제품 여부: 이름 자체가 회사 제품 모델명과 일치하는가.

    주의: model 컬럼은 '어느 모델에 적용되는 부품인지'를 의미하므로
    is_final_model 판정에 사용하지 않는다. name이 모델명 그 자체일 때만 True.
    """
    n = clean_text(name).upper().replace(" ", "")
    if not n:
        return False
    for fm in FINAL_MODELS:
        fm_n = fm.upper().replace(" ", "")
        if n == fm_n:
            return True
    return False


def has_assy_keyword(name: str) -> bool:
    upper = str(name).upper()
    return any(kw in upper for kw in ASSY_KEYWORDS)


def classify_bc_only(file: str, dept: str, raw_name: str, model: str) -> str:
    """파일 B 또는 C 단독 항목의 카테고리 코드 결정.

    기준:
        FG: 이름이 회사 모델명 그 자체 (최종 완제품)
        BF/HF/VF: ASS'Y 키워드 포함 (완제품/서브어셈블리)
        BA/HA/VA: 기본 (반제품/부품)
    """
    if is_final_model(raw_name):
        return "FG"

    has_assy = has_assy_keyword(raw_name)

    if file == "B":
        return "BF" if has_assy else "BA"

    # 파일 C
    d = dept.strip() if dept else ""
    if d == "고압":
        return "HF" if has_assy else "HA"
    if d in ("진공", "튜닝"):
        return "VF" if has_assy else "VA"
    # 구버전/미사용/사용중 등 기타는 HA로 디폴트
    return "HA"


# ---------------------------------------------------------------------------
# 마스터 DB 빌드
# ---------------------------------------------------------------------------

MASTER_COLUMNS = [
    "item_id",
    "category_code",
    "std_name",
    "std_spec",
    "std_unit",
    "part_type",
    "maker",
    "maker_pn",
    "supplier",
    "department",
    "model_ref",
    "stock_prev",
    "stock_current",
    "safety_stock",
    "moq",
    "lead_time",
    "source_file",
    "source_sheet",
    "source_row",
    "original_name_a",
    "original_name_bc",
    "mapping_status",
    "notes",
    "created_at",
]


def _int_or_none(v):
    try:
        if pd.isna(v):
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _str_or_empty(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return clean_text(v)


def build_master(
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
    df_c: pd.DataFrame,
    matches: list[dict],
    matched_bc_keys: set,
    bc_match_count: dict,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    통합 마스터 DB 및 source_links 링크 테이블 생성.
    """
    rows = []
    links = []
    created_at = datetime.now().isoformat(timespec="seconds")

    # 카테고리별 시퀀스 카운터
    seq_counters: dict[str, int] = {}

    def next_item_id(cat: str) -> str:
        seq_counters[cat] = seq_counters.get(cat, 0) + 1
        return f"{cat}-{seq_counters[cat]:06d}"

    # -------- 1. 파일 A의 모든 품목을 RM 또는 raw_only 로 등록 --------
    for m in matches:
        a_row = df_a.loc[m["a_idx"]]
        a_name = _str_or_empty(a_row.get("품명"))
        a_spec = _str_or_empty(a_row.get("규격"))
        a_part_type = _str_or_empty(a_row.get("부품종류"))
        a_maker = _str_or_empty(a_row.get("MAKER"))
        a_maker_pn = _str_or_empty(a_row.get("MAKER품번"))
        a_supplier = _str_or_empty(a_row.get("공급처"))

        bc = m["bc"]
        if bc is not None:
            # 매핑 완료 → RM
            cat = "RM"
            status = "mapped"
            original_name_bc = bc["raw_name"]
            model_ref = bc["model"]
            department = bc["department"]
            notes = f"matched to file {bc['file']} row {bc['row']} (score={m['score']})"
            # 다중 매핑 경고 (동일 BC에 여러 A가 매핑된 경우)
            dup_count = bc_match_count.get(bc["df_index"], 0)
            if dup_count > 1:
                notes += f"; WARN: same BC matched by {dup_count} A-items (review)"
        else:
            # 파일 A 단독 → 원자재지만 B/C에 없음
            cat = "RM"
            status = "raw_only"
            original_name_bc = ""
            model_ref = ""
            department = ""
            notes = "A단독: 파일 B/C에서 매칭 실패"

        item_id = next_item_id(cat)
        rows.append({
            "item_id": item_id,
            "category_code": cat,
            "std_name": std_name(a_name, a_spec),
            "std_spec": clean_text(a_spec),
            "std_unit": "",
            "part_type": a_part_type,
            "maker": a_maker,
            "maker_pn": a_maker_pn,
            "supplier": a_supplier,
            "department": department,
            "model_ref": model_ref,
            "stock_prev": _int_or_none(a_row.get("전월재고")),
            "stock_current": _int_or_none(a_row.get("현재고")),
            "safety_stock": _int_or_none(a_row.get("안전재고수량")),
            "moq": _int_or_none(a_row.get("MOQ")),
            "lead_time": _str_or_empty(a_row.get("납기")),
            "source_file": "A",
            "source_sheet": "26.03월",
            "source_row": int(a_row["_source_row"]),
            "original_name_a": a_name,
            "original_name_bc": original_name_bc,
            "mapping_status": status,
            "notes": notes,
            "created_at": created_at,
        })

        # 소스 링크
        links.append({
            "item_id": item_id,
            "source_file": "A",
            "source_sheet": "26.03월",
            "source_row": int(a_row["_source_row"]),
            "original_name": a_name,
        })
        if bc is not None:
            links.append({
                "item_id": item_id,
                "source_file": bc["file"],
                "source_sheet": bc["sheet"],
                "source_row": int(bc["row"]),
                "original_name": bc["raw_name"],
            })

    # -------- 2. 파일 B 단독 (매핑되지 않은 항목) --------
    for i, row in df_b.iterrows():
        if ("B", i) in matched_bc_keys:
            continue
        raw = _str_or_empty(row["item_name"])
        model = _str_or_empty(row.get("model"))
        group = _str_or_empty(row.get("category_group"))
        cat = classify_bc_only("B", "조립", raw, model)

        item_id = next_item_id(cat)
        rows.append({
            "item_id": item_id,
            "category_code": cat,
            "std_name": std_name(raw, ""),
            "std_spec": extract_spec_from_name(raw),
            "std_unit": "",
            "part_type": group,
            "maker": "",
            "maker_pn": "",
            "supplier": "",
            "department": "조립",
            "model_ref": model,
            "stock_prev": _int_or_none(row.get("전월재고")),
            "stock_current": _int_or_none(row.get("현재고")),
            "safety_stock": None,
            "moq": None,
            "lead_time": "",
            "source_file": "B",
            "source_sheet": "조립 자재",
            "source_row": int(row["_source_row"]),
            "original_name_a": "",
            "original_name_bc": raw,
            "mapping_status": "assy_only",
            "notes": "B단독: Ass'y/완제품 후보",
            "created_at": created_at,
        })
        links.append({
            "item_id": item_id,
            "source_file": "B",
            "source_sheet": "조립 자재",
            "source_row": int(row["_source_row"]),
            "original_name": raw,
        })

    # -------- 3. 파일 C 단독 (매핑되지 않은 항목) --------
    for i, row in df_c.iterrows():
        if ("C", i) in matched_bc_keys:
            continue
        raw = _str_or_empty(row["item_name"])
        model = _str_or_empty(row.get("model"))
        dept = _str_or_empty(row.get("department"))
        sub = _str_or_empty(row.get("sub_class"))
        cat = classify_bc_only("C", dept, raw, model)

        item_id = next_item_id(cat)
        rows.append({
            "item_id": item_id,
            "category_code": cat,
            "std_name": std_name(raw, ""),
            "std_spec": extract_spec_from_name(raw),
            "std_unit": "",
            "part_type": sub,
            "maker": "",
            "maker_pn": "",
            "supplier": "",
            "department": dept,
            "model_ref": model,
            "stock_prev": _int_or_none(row.get("전월재고")),
            "stock_current": _int_or_none(row.get("현재고")),
            "safety_stock": None,
            "moq": None,
            "lead_time": "",
            "source_file": "C",
            "source_sheet": "고압",
            "source_row": int(row["_source_row"]),
            "original_name_a": "",
            "original_name_bc": raw,
            "mapping_status": "assy_only",
            "notes": f"C단독({dept}): Ass'y/완제품 후보",
            "created_at": created_at,
        })
        links.append({
            "item_id": item_id,
            "source_file": "C",
            "source_sheet": "고압",
            "source_row": int(row["_source_row"]),
            "original_name": raw,
        })

    df_master = pd.DataFrame(rows, columns=MASTER_COLUMNS)
    df_links = pd.DataFrame(links, columns=[
        "item_id", "source_file", "source_sheet", "source_row", "original_name",
    ])
    return df_master, df_links


# ---------------------------------------------------------------------------
# 리포트
# ---------------------------------------------------------------------------

def write_report(
    df_master: pd.DataFrame,
    matches: list[dict],
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
    df_c: pd.DataFrame,
) -> None:
    """통합 결과 리포트(Markdown) 작성."""
    total_a = len(df_a)
    mapped_a = sum(1 for m in matches if m["bc"] is not None)
    unmapped_a = total_a - mapped_a
    mapping_rate = (mapped_a / total_a * 100) if total_a else 0

    cat_dist = df_master["category_code"].value_counts().to_dict()
    status_dist = df_master["mapping_status"].value_counts().to_dict()

    lines = []
    lines.append("# ERP 자재 마스터 DB 통합 리포트")
    lines.append("")
    lines.append(f"- **생성 시각**: {datetime.now().isoformat(timespec='seconds')}")
    lines.append(f"- **총 마스터 항목 수**: {len(df_master)}")
    lines.append("")
    lines.append("## 입력 파일")
    lines.append("")
    lines.append(f"| 파일 | 시트 | 유효 행 수 |")
    lines.append(f"|---|---|---|")
    lines.append(f"| A (`F704-03`) | 26.03월 | {len(df_a)} |")
    lines.append(f"| B (`조립,출하파트`) | 조립 자재 | {len(df_b)} |")
    lines.append(f"| C (`고압,진공,튜닝파트`) | 고압 | {len(df_c)} |")
    lines.append("")
    lines.append("## 파일 A 매칭 결과")
    lines.append("")
    lines.append(f"- 매칭 성공: **{mapped_a} / {total_a}** ({mapping_rate:.1f}%)")
    lines.append(f"- 매칭 실패(A 단독): **{unmapped_a}**")
    lines.append("")
    lines.append("## 카테고리 분포")
    lines.append("")
    lines.append("| 코드 | 설명 | 개수 |")
    lines.append("|---|---|---|")
    cat_desc = {
        "RM": "원자재 (Raw Material)",
        "BA": "조립 반제품 (Assembly Sub-Assembly)",
        "BF": "조립 완제품 (Assembly Finished)",
        "HA": "고압 반제품 (High-voltage Sub-Assembly)",
        "HF": "고압 완제품 (High-voltage Finished)",
        "VA": "진공 반제품 (Vacuum Sub-Assembly)",
        "VF": "진공 완제품 (Vacuum Finished)",
        "FG": "최종 완제품 (Final Goods)",
    }
    for code, desc in cat_desc.items():
        lines.append(f"| `{code}` | {desc} | {cat_dist.get(code, 0)} |")
    lines.append("")
    lines.append("## 매핑 상태 분포")
    lines.append("")
    lines.append("| 상태 | 개수 |")
    lines.append("|---|---|")
    for status, count in status_dist.items():
        lines.append(f"| `{status}` | {count} |")
    lines.append("")
    lines.append("## 샘플: 매핑 성공 (상위 20건)")
    lines.append("")
    sample_mapped = df_master[df_master["mapping_status"] == "mapped"].head(20)
    if len(sample_mapped):
        lines.append("| item_id | category | std_name | 파일A 원본 | 파일B/C 원본 |")
        lines.append("|---|---|---|---|---|")
        for _, r in sample_mapped.iterrows():
            lines.append(
                f"| `{r['item_id']}` | {r['category_code']} | {r['std_name']} | "
                f"{r['original_name_a']} | {r['original_name_bc']} |"
            )
    lines.append("")
    lines.append("## 샘플: Ass'y 단독 (B 5건 + C 5건)")
    lines.append("")
    sample_b = df_master[(df_master["source_file"] == "B") & (df_master["mapping_status"] == "assy_only")].head(5)
    sample_c = df_master[(df_master["source_file"] == "C") & (df_master["mapping_status"] == "assy_only")].head(5)
    lines.append("| item_id | category | std_name | 소스 | department | model_ref |")
    lines.append("|---|---|---|---|---|---|")
    for _, r in pd.concat([sample_b, sample_c]).iterrows():
        lines.append(
            f"| `{r['item_id']}` | {r['category_code']} | {r['std_name']} | "
            f"{r['source_file']} | {r['department']} | {r['model_ref']} |"
        )
    lines.append("")
    lines.append("## 파일 A 미매핑 목록 (raw_only)")
    lines.append("")
    unmapped = df_master[df_master["mapping_status"] == "raw_only"]
    lines.append(f"총 {len(unmapped)}건. (별도 CSV: `ERP_Unmatched_A_Items.csv`)")
    lines.append("")
    lines.append("### 미매핑 A 항목 (상위 20건)")
    lines.append("")
    lines.append("| item_id | 부품종류 | 품명 | 규격 |")
    lines.append("|---|---|---|---|")
    for _, r in unmapped.head(20).iterrows():
        lines.append(
            f"| `{r['item_id']}` | {_md_cell_safe(r['part_type'])} | "
            f"{_md_cell_safe(r['original_name_a'])} | {_md_cell_safe(r['std_spec'])} |"
        )
    lines.append("")
    lines.append("대부분 X-ray 튜브 내부 부품 (전극, 필라멘트, 게터, 세라믹 바디 등) 또는 "
                 "BOM 하위 원자재로, 파일 B/C에 독립 항목으로 등록되지 않은 것이 정상적임.")
    lines.append("")

    # 다중 매핑 경고 (수동 검토용)
    multi_mapped = df_master[
        df_master["notes"].astype(str).str.contains("WARN: same BC matched", na=False)
    ]
    if len(multi_mapped) > 0:
        lines.append("## 다중 매핑 경고 (수동 검토 필요)")
        lines.append("")
        lines.append(
            f"동일한 파일 B/C 항목에 여러 파일 A 항목이 매핑된 경우: **{len(multi_mapped)}건**"
        )
        lines.append("")
        lines.append(
            "이는 (a) 파일 A에 실제로 동일 부품이 중복 등록되었거나, "
            "(b) 품명이 범용어("
            "센서"
            ", "
            "NAME PLATE"
            " 등)여서 매칭이 애매한 경우. 도메인 전문가의 검토 필요."
        )
        lines.append("")
        # 상위 중복 BC 항목 표시
        dup_bc_items = (
            multi_mapped.groupby("original_name_bc").size().sort_values(ascending=False).head(10)
        )
        lines.append("### 다중 매핑 상위 BC 항목 (Top 10)")
        lines.append("")
        lines.append("| 파일 B/C 이름 | 매핑된 A 항목 수 |")
        lines.append("|---|---|")
        for bc_name, count in dup_bc_items.items():
            lines.append(f"| {_md_cell_safe(bc_name)} | {count} |")
        lines.append("")

    OUTPUT_REPORT.write_text("\n".join(lines), encoding="utf-8")

    # 미매핑 A 항목만 별도 CSV
    unmapped.to_csv(OUTPUT_UNMATCHED, index=False, encoding="utf-8-sig")


def write_mapping_sample(df_master: pd.DataFrame) -> None:
    """사용자 요청 포맷의 매핑 샘플 30건 (매핑 20 + Ass'y 10) 출력.

    컬럼:
        표준코드 | 표준품명 | 표준규격 | 파일A의 이름 | 파일B/C의 이름 | 비고
    """
    lines = []
    lines.append("# ERP 자재 매핑 샘플 (30건)")
    lines.append("")
    lines.append("매핑 로직 검증을 위한 대표 샘플.")
    lines.append("")
    lines.append(
        "| 표준코드 | 표준품명 | 표준규격 | 파일 A 이름 | 파일 B/C 이름 | 비고 |"
    )
    lines.append("|---|---|---|---|---|---|")

    # 1. 매핑 완료 20건 - 파일 A 매칭 중 다양성 있게 샘플링
    mapped = df_master[df_master["mapping_status"] == "mapped"].copy()
    sample_mapped = mapped.head(20)
    for _, r in sample_mapped.iterrows():
        lines.append(
            f"| `{r['item_id']}` | {r['std_name']} | {_md_cell(r['std_spec'])} | "
            f"{_md_cell(r['original_name_a'])} | {_md_cell(r['original_name_bc'])} | 매핑 완료 |"
        )

    # 2. B 단독 Ass'y 5건
    b_assy = df_master[
        (df_master["source_file"] == "B") &
        (df_master["mapping_status"] == "assy_only")
    ].head(5)
    for _, r in b_assy.iterrows():
        lines.append(
            f"| `{r['item_id']}` | {r['std_name']} | {_md_cell(r['std_spec'])} | "
            f"- | {_md_cell(r['original_name_bc'])} | Ass'y 단독 (B) |"
        )

    # 3. C 단독 Ass'y 5건
    c_assy = df_master[
        (df_master["source_file"] == "C") &
        (df_master["mapping_status"] == "assy_only")
    ].head(5)
    for _, r in c_assy.iterrows():
        lines.append(
            f"| `{r['item_id']}` | {r['std_name']} | {_md_cell(r['std_spec'])} | "
            f"- | {_md_cell(r['original_name_bc'])} | Ass'y 단독 (C-{r['department']}) |"
        )

    lines.append("")
    lines.append("## 통계")
    lines.append("")
    total = len(df_master)
    mapped_cnt = (df_master["mapping_status"] == "mapped").sum()
    assy_cnt = (df_master["mapping_status"] == "assy_only").sum()
    raw_cnt = (df_master["mapping_status"] == "raw_only").sum()
    lines.append(f"- 전체 마스터 항목: **{total}**")
    lines.append(f"- 매핑 완료: **{mapped_cnt}**")
    lines.append(f"- Ass'y 단독 (B/C): **{assy_cnt}**")
    lines.append(f"- A 단독 (미매핑): **{raw_cnt}**")

    OUTPUT_MAPPING_SAMPLE.write_text("\n".join(lines), encoding="utf-8")


def _md_cell(v) -> str:
    """Markdown 셀용 문자열 정제 (파이프 이스케이프, NaN 제거)."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).replace("|", "\\|").replace("\n", " ")
    return s.strip() or ""


def _md_cell_safe(v) -> str:
    """None/nan/실수 혼합 대응용 Markdown 셀."""
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except (TypeError, ValueError):
        pass
    s = str(v).replace("|", "\\|").replace("\n", " ")
    if s.lower() == "nan":
        return ""
    return s.strip()


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------

def main():
    print("[1/5] 파일 A 로딩...")
    df_a = load_file_a()
    print(f"    → {len(df_a)} 행")

    print("[2/5] 파일 B 로딩...")
    df_b = load_file_b()
    print(f"    → {len(df_b)} 행")

    print("[3/5] 파일 C 로딩...")
    df_c = load_file_c()
    print(f"    → {len(df_c)} 행")

    print("[4/5] 매칭 수행 (파일 A → 파일 B/C)...")
    bc_index = build_bc_index(df_b, df_c)
    matches, matched_bc_keys, bc_match_count = match_a_against_bc(df_a, bc_index)
    mapped = sum(1 for m in matches if m["bc"] is not None)
    print(f"    → 매칭 성공: {mapped} / {len(df_a)} ({mapped/len(df_a)*100:.1f}%)")
    dup_bc = sum(1 for c in bc_match_count.values() if c > 1)
    print(f"    → 다중 매핑된 BC 항목 수 (review 필요): {dup_bc}")

    print("[5/5] 마스터 DB 구축 & 저장...")
    df_master, df_links = build_master(
        df_a, df_b, df_c, matches, matched_bc_keys, bc_match_count
    )
    df_master.to_csv(OUTPUT_MASTER, index=False, encoding="utf-8-sig")
    df_links.to_csv(OUTPUT_LINKS, index=False, encoding="utf-8-sig")
    write_report(df_master, matches, df_a, df_b, df_c)
    write_mapping_sample(df_master)

    print()
    print("=" * 60)
    print("통합 완료")
    print("=" * 60)
    print(f"  - {OUTPUT_MASTER.name}: {len(df_master)} 행")
    print(f"  - {OUTPUT_LINKS.name}: {len(df_links)} 행")
    print(f"  - {OUTPUT_REPORT.name}")
    print(f"  - {OUTPUT_UNMATCHED.name}")
    print(f"  - {OUTPUT_MAPPING_SAMPLE.name}")
    print()
    print("카테고리 분포:")
    print(df_master["category_code"].value_counts().to_string())
    print()
    print("매핑 상태:")
    print(df_master["mapping_status"].value_counts().to_string())


if __name__ == "__main__":
    main()
