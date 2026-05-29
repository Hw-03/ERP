/**
 * glossary.test.ts — 출입고 도메인 단일 사전 drift 방지 (P0-1).
 *
 * 본 테스트는 다음을 검증한다:
 *  1. 모든 IoWorkType / IoSubType / TransactionType 키가 사전에 등록되어 있다 (누락 방지).
 *  2. 핵심 라벨이 의도된 캐노니컬 값과 일치한다 (실수로 바뀌면 즉시 감지).
 *  3. interpretShipLabel 규칙이 PF + warehouse out 조합에만 "출하" 를 반환한다.
 *
 * 사전 자체 값이 바뀌어야 한다면 본 테스트를 함께 갱신한다 (의도 표시).
 */
import { describe, expect, it } from "vitest";
import {
  BUCKET_LABEL,
  REQUEST_TYPE_LABEL,
  SHIP_RULE,
  SUB_TYPE_DESCRIPTION,
  SUB_TYPE_LABEL,
  TRANSACTION_TYPE_LABEL,
  WORK_TYPE_DESCRIPTION,
  WORK_TYPE_LABEL,
  interpretShipLabel,
  listAllSubTypes,
  listAllTransactionTypes,
  listAllWorkTypes,
} from "../glossary";
import type { IoSubType, IoWorkType } from "@/lib/api/types/io";
import type { TransactionType } from "@/lib/api/types/shared";

describe("glossary — 키 완전성", () => {
  it("모든 IoWorkType 키가 WORK_TYPE_LABEL / WORK_TYPE_DESCRIPTION 에 있다", () => {
    const expected: IoWorkType[] = ["receive", "warehouse_io", "process", "defect"];
    for (const wt of expected) {
      expect(WORK_TYPE_LABEL[wt]).toBeTruthy();
      expect(WORK_TYPE_DESCRIPTION[wt]).toBeTruthy();
    }
    expect(listAllWorkTypes().sort()).toEqual([...expected].sort());
  });

  it("모든 IoSubType 키가 SUB_TYPE_LABEL / SUB_TYPE_DESCRIPTION 에 있다", () => {
    const expected: IoSubType[] = [
      "receive_supplier",
      "warehouse_to_dept",
      "dept_to_warehouse",
      "dept_transfer",
      "produce",
      "disassemble",
      "adjust_in",
      "adjust_out",
      "defect_quarantine",
      "defect_restore",
      "defect_process",
      "supplier_return",
    ];
    for (const st of expected) {
      expect(SUB_TYPE_LABEL[st]).toBeTruthy();
      expect(SUB_TYPE_DESCRIPTION[st]).toBeTruthy();
    }
    expect(listAllSubTypes().sort()).toEqual([...expected].sort());
  });

  it("모든 TransactionType 키가 TRANSACTION_TYPE_LABEL 에 있다", () => {
    const expected: TransactionType[] = [
      "RECEIVE",
      "PRODUCE",
      "SHIP",
      "ADJUST",
      "BACKFLUSH",
      "DISASSEMBLE",
      "TRANSFER_TO_PROD",
      "TRANSFER_TO_WH",
      "TRANSFER_DEPT",
      "MARK_DEFECTIVE",
      "UNMARK_DEFECTIVE",
      "DEFECT_SCRAP",
      "SUPPLIER_RETURN",
    ];
    for (const tx of expected) {
      expect(TRANSACTION_TYPE_LABEL[tx]).toBeTruthy();
    }
    expect(listAllTransactionTypes().sort()).toEqual([...expected].sort());
  });

  it("REQUEST_TYPE_LABEL 에 화면이 사용하는 키들이 모두 있다", () => {
    const used = [
      "raw_receive",
      "raw_ship",
      "warehouse_to_dept",
      "dept_to_warehouse",
      "dept_internal",
      "mark_defective_wh",
      "mark_defective_prod",
      "supplier_return",
      "manual_adjustment",
      "defect_scrap",
      "defect_return",
      "defect_disassemble",
    ];
    for (const k of used) {
      expect(REQUEST_TYPE_LABEL[k]).toBeTruthy();
    }
  });

  it("BUCKET_LABEL 에 모든 IoBucket 키가 있다", () => {
    expect(BUCKET_LABEL.warehouse).toBe("창고");
    expect(BUCKET_LABEL.production).toBe("부서");
    expect(BUCKET_LABEL.defective).toBe("불량");
    expect(BUCKET_LABEL.none).toBe("외부");
  });
});

describe("glossary — 캐노니컬 라벨 고정", () => {
  it("DISASSEMBLE 은 '분해' (이전 일부 화면의 '재작업' 폐기)", () => {
    expect(SUB_TYPE_LABEL.disassemble).toBe("분해");
    expect(TRANSACTION_TYPE_LABEL.DISASSEMBLE).toBe("분해");
  });

  it("defect 계열은 '불량' 어휘로 통일 ('격리' 폐기)", () => {
    expect(SUB_TYPE_LABEL.defect_quarantine).toBe("새 불량");
    expect(SUB_TYPE_LABEL.defect_restore).toBe("불량 해제");
    expect(SUB_TYPE_LABEL.defect_process).toBe("불량 처리");
    expect(TRANSACTION_TYPE_LABEL.MARK_DEFECTIVE).toBe("새 불량");
    expect(TRANSACTION_TYPE_LABEL.UNMARK_DEFECTIVE).toBe("불량 해제");
    expect(TRANSACTION_TYPE_LABEL.DEFECT_SCRAP).toBe("불량 처리");
  });

  it("work type 'process' 는 '부서 입출고'", () => {
    expect(WORK_TYPE_LABEL.process).toBe("부서 입출고");
  });

  it("warehouse_to_dept / dept_to_warehouse 는 방향 화살표 형식", () => {
    expect(SUB_TYPE_LABEL.warehouse_to_dept).toBe("창고 → 부서");
    expect(SUB_TYPE_LABEL.dept_to_warehouse).toBe("부서 → 창고");
  });
});

describe("interpretShipLabel — 출하 규칙", () => {
  it("PF 품목이 창고에서 외부로 나가면 '출하'", () => {
    expect(
      interpretShipLabel({
        transactionType: "SHIP",
        fromBucket: "warehouse",
        toBucket: "none",
        itemProcessTypeCode: "PF",
      }),
    ).toBe("출하");
    expect(
      interpretShipLabel({
        transactionType: "SHIP",
        fromBucket: "warehouse",
        toBucket: "none",
        itemProcessTypeCode: "PA",
      }),
    ).toBe("출하");
    expect(
      interpretShipLabel({
        transactionType: "SHIP",
        fromBucket: "warehouse",
        toBucket: "none",
        itemProcessTypeCode: "PR",
      }),
    ).toBe("출하");
  });

  it("PF 아닌 품목은 '출하' 아님 (null)", () => {
    expect(
      interpretShipLabel({
        transactionType: "SHIP",
        fromBucket: "warehouse",
        toBucket: "none",
        itemProcessTypeCode: "TA",
      }),
    ).toBeNull();
  });

  it("SHIP 이 아니면 '출하' 아님", () => {
    expect(
      interpretShipLabel({
        transactionType: "RECEIVE",
        fromBucket: "warehouse",
        toBucket: "none",
        itemProcessTypeCode: "PF",
      }),
    ).toBeNull();
  });

  it("창고가 아닌 곳에서 나가면 '출하' 아님", () => {
    expect(
      interpretShipLabel({
        transactionType: "SHIP",
        fromBucket: "production",
        toBucket: "none",
        itemProcessTypeCode: "PF",
      }),
    ).toBeNull();
  });

  it("SHIP_RULE.workTypeShouldNotExist 가 true — V2 compose 에 ship 버튼 추가 금지", () => {
    expect(SHIP_RULE.workTypeShouldNotExist).toBe(true);
  });
});
