"""5/22 백업 기준으로 items.item_code 만 되살림.

다른 테이블(BOM, 거래, 직원 등) 및 items의 다른 컬럼은 건드리지 않음.

전략:
1. 현재 DB 백업
2. items.item_code를 모두 NULL로 초기화 (unique 제약 충돌 방지)
3. 백업 DB의 item_id → 옛 item_code 매핑 적용 (918건)
4. 진한 파랑 21건은 item_name → 권동환 엑셀에 기록된 코드 적용
5. 진짜 신규 4건은 옛 시리얼 체계의 max+1로 부여
6. serial_no 컬럼도 item_code 마지막 4자리로 동기화
"""
import sqlite3
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops.maintenance_backup import create_sqlite_snapshot  # noqa: E402

BAK = Path('backend/_backup/mes_pre_blue_register_20260522_134758.db')
CUR = Path('backend/mes.db')

BLUE_MAP = {
    'ADX6000 내부폼 상판 [47x36.5x2.5 mm] (뱅가드 46F용)': '6-PR-0369',
    'ADX6000 내부폼 중판 [47x36.5x5.5 mm] (뱅가드 46F용)': '6-PR-0370',
    'ADX6000 내부폼 하판 [47x36.5x7.5 mm] (뱅가드 46F용)': '6-PR-0371',
    'ADX6000 Battery Pack (사급자재)': '6-PR-0372',
    '히팅 싱크 + 방열팬 (구형)': '46-AA-0001',
    '히팅 싱크 + 방열팬 (신형)': '46-AA-0002',
    'DX3000V 기본 배터리 [PF435060 60C 950mA]': '3-PR-0228',
    'D-910 크래들 TOP 사출': '348-AR-0001',
    'D-910 크래들 BOTTOM 사출': '348-AR-0002',
    'CD 케이스': '34678-PR-0277',
    '공 CD': '34678-PR-0278',
    'PLATTZ 330N 센서 하네스 1번 (배터리팩 4핀)': '34678-PR-0279',
    'PLATTZ 330N 센서 하네스 2번 (전원 스위치 2핀)': '34678-PR-0280',
    'PLATTZ 330N 센서 하네스 3번 (FLAT 24핀)': '34678-PR-0281',
    'PLATTZ 330N 센서 하네스 4번 (8핀)': '34678-PR-0282',
    'PLATTZ 330N 센서 하네스 5번 (인터페이스 케이블)': '34678-PR-0283',
    'PLATTZ 330N 센서 고무 RUBBER': '34678-PR-0284',
    '17.0V 5A SMPS (85W) [DEX-A085-M]': '3-PR-0229',
    '마그네틱 젠더': '3-PR-0230',
    '스킨가드 구형 (납작)': '6-PR-0373',
    '와이어 몰드': '3-PR-0231',
}


def create_current_db_backup(source_path: Path = CUR) -> Path:
    """Create the pre-code-restore DB snapshot in MES_RUNTIME_ROOT."""
    return create_sqlite_snapshot(source_path, "restore-item-codes")


def parse_serial(code):
    m = re.search(r'-(\d+)$', code)
    return int(m.group(1)) if m else None


def main():
    print('=== 1. 현재 DB 백업 ===')
    current_backup = create_current_db_backup()
    print(f'  {current_backup}')

    # 백업 매핑 로드
    print()
    print('=== 2. 백업 매핑 로드 ===')
    c_bak = sqlite3.connect(BAK)
    cb = c_bak.cursor()
    cb.execute('SELECT item_id, item_code FROM items WHERE item_code IS NOT NULL')
    bak_map = dict(cb.fetchall())
    c_bak.close()
    print(f'  백업 (item_id → 옛 코드): {len(bak_map)}')

    # 현재 DB 로드
    c = sqlite3.connect(CUR)
    cur = c.cursor()
    cur.execute('SELECT item_id, item_name, model_symbol, process_type_code FROM items')
    cur_rows = cur.fetchall()
    print(f'  현재 items: {len(cur_rows)}')

    # 새 코드 계획 만들기
    new_codes = {}  # item_id → new_code
    common = used_blue = used_new = 0
    pending_new = []  # 진짜 신규 (model, process, item_id, item_name)

    for iid, name, m, p in cur_rows:
        if iid in bak_map:
            new_codes[iid] = bak_map[iid]
            common += 1
        elif name in BLUE_MAP:
            new_codes[iid] = BLUE_MAP[name]
            used_blue += 1
        else:
            pending_new.append((iid, name, m, p))

    # 진짜 신규는 옛 시리얼 체계 max+1
    # 옛 시리얼 = 백업의 max(serial_no) WHERE model+process 같음. 진한 파랑 21건은 백업에 없지만
    # BLUE_MAP 코드의 시리얼도 옛 max에 포함시켜야 (이미 등록됨)
    blue_serial_by_key = {}
    for name, code in BLUE_MAP.items():
        m = re.match(r'^([\d]+)-([A-Z]+)-(\d+)$', code)
        if m:
            key = (m.group(1), m.group(2))
            s = int(m.group(3))
            blue_serial_by_key[key] = max(blue_serial_by_key.get(key, 0), s)

    # 백업의 model+process 별 max serial
    c_bak = sqlite3.connect(BAK)
    cb = c_bak.cursor()
    serial_max = {}
    for (m, p), s in blue_serial_by_key.items():
        serial_max[(m, p)] = s
    cb.execute('SELECT model_symbol, process_type_code, MAX(serial_no) FROM items WHERE item_code IS NOT NULL GROUP BY model_symbol, process_type_code')
    for m, p, s in cb.fetchall():
        key = (m, p)
        serial_max[key] = max(serial_max.get(key, 0), s or 0)
    c_bak.close()

    # 진짜 신규에 새 코드 부여
    new_assignments = []
    for iid, name, m, p in pending_new:
        key = (m, p)
        next_s = serial_max.get(key, 0) + 1
        serial_max[key] = next_s
        code = f'{m}-{p}-{next_s:04d}'
        new_codes[iid] = code
        new_assignments.append((iid, name, code))
        used_new += 1

    print()
    print(f'=== 3. 코드 부여 계획 ===')
    print(f'  백업에서 복원: {common}')
    print(f'  진한 파랑 옛 코드 적용: {used_blue}')
    print(f'  진짜 신규에 새 코드 부여: {used_new}')
    for iid, name, code in new_assignments:
        print(f'    {code}: {name!r}')

    # 코드 중복 검증
    code_count = {}
    for code in new_codes.values():
        code_count[code] = code_count.get(code, 0) + 1
    dupes = {c: n for c, n in code_count.items() if n > 1}
    if dupes:
        print(f'\n⚠ 중복 코드: {dupes}')
        return

    print()
    print('=== 4. DB 적용 (트랜잭션) ===')
    cur.execute('BEGIN')
    # 4-1. 모든 item_code NULL로 (unique 충돌 방지)
    cur.execute('UPDATE items SET item_code = NULL')
    # 4-2. 새 매핑 적용
    for iid, code in new_codes.items():
        serial = parse_serial(code)
        cur.execute('UPDATE items SET item_code = ?, serial_no = ? WHERE item_id = ?',
                    (code, serial, iid))
    c.commit()
    print(f'  {len(new_codes)}건 적용 완료')

    # 5. 검증
    print()
    print('=== 5. 검증 ===')
    cur.execute('SELECT COUNT(*) FROM items')
    n = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM items WHERE item_code IS NOT NULL')
    nc = cur.fetchone()[0]
    print(f'  items: {n}, item_code 채워진 행: {nc}')
    # 샘플 체크
    for code in ['7-TR-0001', '6-AR-0014', '6-AR-0185', '6-PR-0369', '348-AR-0001',
                 '34678-PR-0277', '6-AR-0719']:
        cur.execute('SELECT item_name FROM items WHERE item_code=?', (code,))
        r = cur.fetchone()
        print(f'  {code}: {r}')

    c.close()


if __name__ == '__main__':
    main()
