"""
주간보고 md → 메일 복붙용 txt 변환 스크립트
실행: python _attic/scripts/dev/md_to_email.py
입력: _attic/docs/주간보고.md (가장 위 활성 섹션 자동 추출)
출력: _attic/docs/주간보고.txt
"""
import re
import sys
from pathlib import Path

# Windows 콘솔 cp949 호환 — print 시 emdash(—) 깨짐 방지 (파일 저장은 UTF-8 그대로)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SRC = Path("_attic/docs/주간보고.md")
DST = Path("_attic/docs/주간보고.txt")

HRULE  = "─" * 59
BANNER = "=" * 59


def extract_active_section(md_text: str) -> str:
    """첫 '## ' 헤더부터 다음 '## ' 또는 파일 끝까지 잘라옴 (가장 최근 보고)."""
    headers = list(re.finditer(r"^## .+$", md_text, flags=re.MULTILINE))
    if not headers:
        return md_text
    start = headers[0].start()
    end   = headers[1].start() if len(headers) > 1 else len(md_text)
    return md_text[start:end].rstrip()


def md_to_plain(md: str) -> str:
    """마크다운 기호를 평탄화해 메일 복붙용 텍스트로."""
    text = md

    # ## YYYY-MM-DD 헤더 줄 제거 (제목·날짜는 메일 제목창에 별도 표시)
    text = re.sub(r"^## .+\n?", "", text, count=1, flags=re.MULTILINE)

    # 코드 펜스(```) 라인 제거
    text = re.sub(r"^```.*$\n?", "", text, flags=re.MULTILINE)
    # 인라인 코드 `code` → code
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # 굵게 **text** → text
    text = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", text)
    # 이탤릭 *text* → text  (별표 1개, 굵게 처리 후라 안전)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", text)
    # 헤더 ### 등 → 텍스트만
    text = re.sub(r"^#{1,6}\s+(.+)$", r"\1", text, flags=re.MULTILINE)
    # 가로줄 --- → HRULE
    text = re.sub(r"^-{3,}$", HRULE, text, flags=re.MULTILINE)
    # ■ 같은 헤더 라인 살짝 강조 유지 — 그대로 둠

    # 연속 빈 줄 3개 이상 → 2개로 정리
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def split_title_body(plain: str) -> tuple[str | None, str]:
    """'제목: [...]' 한 줄을 메일 제목으로 분리, 나머지는 본문."""
    lines = plain.splitlines()
    title = None
    body  = []
    for line in lines:
        if title is None:
            m = re.match(r"^제목:\s*(.+)$", line.strip())
            if m:
                title = m.group(1).strip()
                continue
        body.append(line)
    # 본문 앞쪽 빈 줄 정리
    while body and not body[0].strip():
        body.pop(0)
    return title, "\n".join(body).rstrip()


def main() -> None:
    md      = SRC.read_text(encoding="utf-8")
    section = extract_active_section(md)
    plain   = md_to_plain(section)
    title, body = split_title_body(plain)

    out = []
    out.append(BANNER)
    out.append("메일 제목 (제목창에 입력)")
    out.append(BANNER)
    out.append(title or "(제목 미지정)")
    out.append("")
    out.append(BANNER)
    out.append("메일 본문 (그대로 복붙)")
    out.append(BANNER)
    out.append(body)
    out.append("")

    DST.write_text("\n".join(out), encoding="utf-8")
    print(f"저장 완료: {DST}")
    if title:
        print(f"메일 제목: {title}")
    print(f"본문 길이: {len(body):,}자")


if __name__ == "__main__":
    main()
