"""Synchronize employee assembly checklists with the development snapshot."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260812_0017"
down_revision: Union[str, None] = "20260807_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": [
        "assembly_checklists",
        "assembly_checklist_sections",
        "assembly_checklist_items",
    ],
    "validator_sql": """
        SELECT CASE WHEN
            (SELECT COUNT(*) FROM assembly_checklists) = 4
            AND (SELECT COUNT(*) FROM assembly_checklist_sections) = 6
            AND (SELECT COUNT(*) FROM assembly_checklist_items) = 50
            AND (
                SELECT GROUP_CONCAT(model_slot, ',')
                FROM (SELECT model_slot FROM assembly_checklists ORDER BY model_slot)
            ) = '1,2,3,5'
        THEN 1 ELSE 0 END
    """,
    "validator_expected": 1,
}

TARGET_MODELS = {
    1: "DX3000",
    2: "COCOON",
    3: "SOLO",
    5: "ADX6000FB",
}

CHECKLIST_ROWS = (
    (
        "4b3ec1456ec44995a34afc6d05f4bbde",
        1,
        "2026-07-27 23:06:43.393435",
        "2026-07-27 23:06:43.393435",
    ),
    (
        "776aca0f52884f63898436d6415c9a43",
        2,
        "2026-07-27 23:06:43.427957",
        "2026-07-27 23:06:43.427957",
    ),
    (
        "6670df17205d45e3801d2083f6d070fb",
        3,
        "2026-07-27 23:06:43.423957",
        "2026-07-27 23:06:43.423957",
    ),
    (
        "5dc78ed4d7a744ac88ed7de007279273",
        5,
        "2026-07-27 23:06:43.419948",
        "2026-07-27 23:06:43.419948",
    ),
)

SECTION_ROWS = (
    (
        "084dd6f161d5486a8a1e88816055cad2",
        "4b3ec1456ec44995a34afc6d05f4bbde",
        "전원 OFF",
        0,
        "2026-07-27 23:06:43.396435",
    ),
    (
        "047befe152dd47b6ae833f40f7ac1d1f",
        "4b3ec1456ec44995a34afc6d05f4bbde",
        "전원 ON",
        1,
        "2026-07-27 23:06:43.398437",
    ),
    (
        "cb48077ba8e54933875479345c85aef3",
        "5dc78ed4d7a744ac88ed7de007279273",
        None,
        0,
        "2026-07-27 23:06:43.420957",
    ),
    (
        "a43019ba080a4ee08ecaec90c3152067",
        "6670df17205d45e3801d2083f6d070fb",
        None,
        0,
        "2026-07-27 23:06:43.424957",
    ),
    (
        "42bc869ac04047e8843bb517b685b5e6",
        "776aca0f52884f63898436d6415c9a43",
        "전원 OFF",
        0,
        "2026-07-27 23:06:43.430957",
    ),
    (
        "1b980b0060254716a2a6c6743980a9d7",
        "776aca0f52884f63898436d6415c9a43",
        "전원 ON",
        1,
        "2026-08-06 06:18:19.771901",
    ),
)

ITEM_ROWS = (
    ("526fb9e93c45458c855fcbdbf7d1c3ca", "047befe152dd47b6ae833f40f7ac1d1f", "펌웨어가 정상적으로 들어갔는지 확인", 0, "2026-07-27 23:06:43.419948"),
    ("d8c4f8e7505f4088823bdec62755dff9", "047befe152dd47b6ae833f40f7ac1d1f", "전원버튼의 녹색 LED가 점등되는지 확인", 1, "2026-07-27 23:06:43.419948"),
    ("da4d0690df15419ca6aa5e110863dea1", "047befe152dd47b6ae833f40f7ac1d1f", "Slide Switch를 사용하여 Right, Left의 EX Button 동작을 확인", 2, "2026-07-27 23:06:43.419948"),
    ("95e6f0ed957d4a4685b6354135a40763", "047befe152dd47b6ae833f40f7ac1d1f", "화면의 글자 깨짐이 있는지 확인", 3, "2026-07-27 23:06:43.419948"),
    ("3727c09f9adb43198699afd8160822f0", "047befe152dd47b6ae833f40f7ac1d1f", "밝기의 차이 및 Backlight의 상태를 확인", 4, "2026-07-27 23:06:43.419948"),
    ("1fa935a6e74b4045b8e1abb37c3b7366", "047befe152dd47b6ae833f40f7ac1d1f", "전원 On/Off 및 Exposure시 부저음 확인", 5, "2026-07-27 23:06:43.419948"),
    ("7d3822454c0e4004a92b9bddb58809cd", "047befe152dd47b6ae833f40f7ac1d1f", "버튼의 눌림 상태와 각 버튼간의 상호적인 눌림이 없는지 확인", 6, "2026-07-27 23:06:43.419948"),
    ("e583728b73134c8da3f25ab91884c7d2", "047befe152dd47b6ae833f40f7ac1d1f", "엑스선이 조사중일 때 황색 LED의 점등을 확인", 7, "2026-07-27 23:06:43.419948"),
    ("e536c7d9f3dc41b5bb6412d45e8bd798", "047befe152dd47b6ae833f40f7ac1d1f", "슬라이드 스위치 우측 확인", 8, "2026-08-06 01:36:04.182227"),
    ("40094c0035154840a5853cc3850d1fdd", "084dd6f161d5486a8a1e88816055cad2", "제품 외관 확인", 0, "2026-07-27 23:06:43.401435"),
    ("1f2a197940b248bc8d9baf39818febd1", "084dd6f161d5486a8a1e88816055cad2", "가죽 손잡이 종류 확인", 1, "2026-08-06 01:21:11.365478"),
    ("c047429ec14f4bf59dbbdc61de1d75a5", "084dd6f161d5486a8a1e88816055cad2", "LCD BD의 리모컨 잭 부분이 FRONT COVER 홀 부분의 들어갔는지 확인", 2, "2026-07-27 23:06:43.401435"),
    ("75c427408d824be1870ff9613ccaabf5", "084dd6f161d5486a8a1e88816055cad2", "WINDOW 상태 양호 확인\n- 방향이 맞는지, 상처가 없는지, 이물질이 들어갔는지 확인", 3, "2026-07-27 23:06:43.401435"),
    ("a4c2a70462bc4ec0831117dffe6bda16", "084dd6f161d5486a8a1e88816055cad2", "하네스 연결 상태 양호\n- FFC 케이블 방향에 맞게 잘 연결하였는지 사출 체결 시 걸리지 않게 잘 부착하였는지 확인", 4, "2026-07-27 23:06:43.401435"),
    ("bbec161b9e24425ca472d56d656d5d9d", "084dd6f161d5486a8a1e88816055cad2", "차폐 납 부착 상태 양호", 5, "2026-07-27 23:06:43.401435"),
    ("e5af6cf8bbbe41f4b8eb5f1b26987f77", "084dd6f161d5486a8a1e88816055cad2", "+-라벨 방향 확인", 6, "2026-07-27 23:06:43.401435"),
    ("794607ba89204bed8291b1536443c869", "084dd6f161d5486a8a1e88816055cad2", "조립 상태(내부) 양호\n- 제품 안쪽 굴러다니는 이물질 확인(CTR BD 이물질 확인)", 7, "2026-07-27 23:06:43.401435"),
    ("229d4cc1313d49c7a157bd211db407e3", "084dd6f161d5486a8a1e88816055cad2", "각 발생부, LCD, 사출의 시리얼라벨이 정상적으로 부착되어있고 \n제품공정카드에 정상적으로 기입되어있는지 확인", 8, "2026-07-27 23:06:43.401435"),
    ("664502553e784954bb66fad4945effd9", "084dd6f161d5486a8a1e88816055cad2", "손잡이 나사 고정 상태 양호 \n- 나사가 풀리지 않는지 직접 확인", 9, "2026-07-27 23:06:43.401435"),
    ("da995b35bbf946b5a60645aab4d2885c", "1b980b0060254716a2a6c6743980a9d7", "전원 ON 시 파워 버튼 청색 LED 확인", 0, "2026-07-27 23:06:43.432958"),
    ("f6b3f978ce1e451e91cf2691255e0d59", "1b980b0060254716a2a6c6743980a9d7", "펌웨어가 정상적으로 들어갔는지 확인", 1, "2026-08-06 06:23:20.175827"),
    ("cda01594901447faa13846226d801e50", "1b980b0060254716a2a6c6743980a9d7", "스피커 음질 상태 확인", 2, "2026-07-27 23:06:43.432958"),
    ("561f2727ad734ce7a1eb614db1b7f1f4", "1b980b0060254716a2a6c6743980a9d7", "LCD 화면 깨짐 확인", 3, "2026-07-27 23:06:43.432958"),
    ("47a650517f4047dab3d0357d98fbb4b0", "1b980b0060254716a2a6c6743980a9d7", "터치 및 반응속도 확인", 4, "2026-07-27 23:06:43.432958"),
    ("ac85fd86bd94415185d93a1f17b1a42d", "42bc869ac04047e8843bb517b685b5e6", "발생부 가이드 체결 확인", 0, "2026-07-27 23:06:43.432958"),
    ("c582a3338cff42248e41fda3623592b2", "42bc869ac04047e8843bb517b685b5e6", "Kapton Film Tape 부착 확인", 1, "2026-07-27 23:06:43.432958"),
    ("66ac489d608c4aa193e36226b8d2c79a", "42bc869ac04047e8843bb517b685b5e6", "FFC , 하네스 빠져있는 부분 없는지 확인", 2, "2026-07-27 23:06:43.432958"),
    ("979f36c36501484892e1ff7b6e6df5ee", "42bc869ac04047e8843bb517b685b5e6", "제품공정카드에 SN이 정상적으로 기입되어있는지 확인", 3, "2026-08-06 06:19:55.389630"),
    ("f255e39f23fd404e9b3dcc77810c679e", "a43019ba080a4ee08ecaec90c3152067", "발생부 가이드 체결 확인", 0, "2026-07-27 23:06:43.429957"),
    ("653288c400844f438b090dce9e8dcff2", "a43019ba080a4ee08ecaec90c3152067", "리모컨 보드 나사 확인", 1, "2026-08-10 02:06:53.504437"),
    ("0a85ecc747e442d1a19de2d09e318af3", "a43019ba080a4ee08ecaec90c3152067", "콘 나사 확인", 2, "2026-08-10 02:06:33.977312"),
    ("35f09e937ac5436daece74613d7fc72e", "a43019ba080a4ee08ecaec90c3152067", "OP 보드 나사 확인", 3, "2026-08-10 02:10:01.192788"),
    ("e58b7fd907f346dfbde3207d16e49d28", "a43019ba080a4ee08ecaec90c3152067", "파워 스위치 보드 나사 확인", 4, "2026-08-10 02:10:13.629241"),
    ("5619c2bbf60d4230ba35ddfd5b886484", "a43019ba080a4ee08ecaec90c3152067", "LED 확산 아크릴 체결 확인", 5, "2026-07-27 23:06:43.429957"),
    ("10298fdf44e844029bc4a304b56282bf", "a43019ba080a4ee08ecaec90c3152067", "Kapton Film Tape 부착 확인", 6, "2026-07-27 23:06:43.429957"),
    ("89944b92832a4698810a1548d7ea67de", "a43019ba080a4ee08ecaec90c3152067", "FFC , 하네스 빠져있는 부분 없는지 확인", 7, "2026-07-27 23:06:43.429957"),
    ("e172d2f6a58f4a4b94f17115473a2dc9", "a43019ba080a4ee08ecaec90c3152067", "제품공정카드에 SN이 정상적으로 기입되어있는지 확인", 8, "2026-07-27 23:06:43.429957"),
    ("5688ef273d354044a489aa1f9008480c", "cb48077ba8e54933875479345c85aef3", "LCD 열고닫을때 소리안나는지 확인", 0, "2026-07-27 23:06:43.423957"),
    ("f3c09b3aa36a463cab6ef9cd6d940855", "cb48077ba8e54933875479345c85aef3", "차폐 납 부착 상태 양호 확인", 1, "2026-07-27 23:06:43.423957"),
    ("ab21d858e6ae437eb2eda7a40d5f2db1", "cb48077ba8e54933875479345c85aef3", "하네스 연결 상태 양호 확인\n-하네스 연결 및 정리 상태 확인", 2, "2026-07-27 23:06:43.423957"),
    ("fbd41871935d4f5fb51a17edee5dac00", "cb48077ba8e54933875479345c85aef3", "조립 상태(내부) 양호 확인\n- 제품 안쪽 굴러다니는 이물질 확인", 3, "2026-07-27 23:06:43.423957"),
    ("68bceecb61554d1895872cd7b1e5472f", "cb48077ba8e54933875479345c85aef3", "조립 상태(외부) 양호 확인\n- 제품 외관 확인", 4, "2026-07-27 23:06:43.423957"),
    ("bca84b6fe8964439b2b13fba7b0dd6e0", "cb48077ba8e54933875479345c85aef3", "CTR BD 및 발생부 연결 상태 양호\n-사출에 빠지지 않고 잘 연결되어 있는지 확인", 5, "2026-07-27 23:06:43.423957"),
    ("b882ebe2e9e14ec29c0c89e7781b2848", "cb48077ba8e54933875479345c85aef3", "배터리 6핀 하네스 정배열맞는지 확인 (가끔 2핀3핀 엇갈려있는 하네스가 있음)", 6, "2026-07-27 23:06:43.423957"),
    ("46e579062d944b40b0dae67f103aa991", "cb48077ba8e54933875479345c85aef3", "6홀 알루미늄 브라켓 안흔들리는지 확인", 7, "2026-07-27 23:06:43.423957"),
    ("51f84c2d31dd4b62937f6c0a954ea078", "cb48077ba8e54933875479345c85aef3", "배터리 단자 위치 확인", 8, "2026-07-27 23:06:43.423957"),
    ("0b37a38e0b6b49028c60e0737606b106", "cb48077ba8e54933875479345c85aef3", "컬리메이터 날개 위치 확인\n-컬리메이터가 안돌아가도록 방향에 맞게 고정되어야함", 9, "2026-07-27 23:06:43.423957"),
    ("cbb4374a73fb4515a32819603a8f6c60", "cb48077ba8e54933875479345c85aef3", "각 발생부, LCD, 사출 등의 시리얼라벨이 정상적으로 부착되어있고 \n제품공정카드에 정상적으로 기입되어있는지 확인", 10, "2026-07-27 23:06:43.423957"),
    ("606e79bcb7164588bc4a70a9fdead7f0", "cb48077ba8e54933875479345c85aef3", "부직포 상태 양호 확인", 11, "2026-07-27 23:06:43.423957"),
    ("7b2fc86f1b0b4d4aa94875c00ce1f006", "cb48077ba8e54933875479345c85aef3", "POWER BUTTON이 정상적으로 눌리는지 확인", 12, "2026-07-27 23:06:43.423957"),
)


def upgrade() -> None:
    """Replace only checklist template rows with the approved development snapshot."""
    if context.is_offline_mode():
        return

    checklists = sa.table(
        "assembly_checklists",
        sa.column("checklist_id", sa.String(32)),
        sa.column("model_slot", sa.SmallInteger()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    sections = sa.table(
        "assembly_checklist_sections",
        sa.column("section_id", sa.String(32)),
        sa.column("checklist_id", sa.String(32)),
        sa.column("title", sa.String(80)),
        sa.column("sort_order", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
    )
    items = sa.table(
        "assembly_checklist_items",
        sa.column("item_id", sa.String(32)),
        sa.column("section_id", sa.String(32)),
        sa.column("content", sa.Text()),
        sa.column("sort_order", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
    )

    bind = op.get_bind()
    existing_models = dict(
        bind.execute(
            sa.text(
                "SELECT slot, model_name FROM product_symbols "
                "WHERE slot IN (1, 2, 3, 5)"
            )
        ).all()
    )
    if existing_models != TARGET_MODELS:
        return

    bind.execute(sa.delete(items))
    bind.execute(sa.delete(sections))
    bind.execute(sa.delete(checklists))

    op.bulk_insert(
        checklists,
        [
            {
                "checklist_id": checklist_id,
                "model_slot": model_slot,
                "created_at": datetime.fromisoformat(created_at),
                "updated_at": datetime.fromisoformat(updated_at),
            }
            for checklist_id, model_slot, created_at, updated_at in CHECKLIST_ROWS
        ],
    )
    op.bulk_insert(
        sections,
        [
            {
                "section_id": section_id,
                "checklist_id": checklist_id,
                "title": title,
                "sort_order": sort_order,
                "created_at": datetime.fromisoformat(created_at),
            }
            for section_id, checklist_id, title, sort_order, created_at in SECTION_ROWS
        ],
    )
    op.bulk_insert(
        items,
        [
            {
                "item_id": item_id,
                "section_id": section_id,
                "content": content,
                "sort_order": sort_order,
                "created_at": datetime.fromisoformat(created_at),
            }
            for item_id, section_id, content, sort_order, created_at in ITEM_ROWS
        ],
    )


def downgrade() -> None:
    """Refuse to guess the employee checklist state that existed before sync."""
    raise RuntimeError("assembly checklist content synchronization downgrade is disabled")
