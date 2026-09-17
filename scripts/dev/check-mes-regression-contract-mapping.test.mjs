import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_TARGET_IDS,
  auditContractMappings,
  requireCompleteContractMappings,
  requirePlanTargetMappings,
} from "./check-mes-regression-contract-mapping.mjs";

const audit = auditContractMappings();

test("실제 270개 계약 ID와 테스트의 명시적 증거 연결을 감사한다", () => {
  assert.equal(audit.contractIds.length, 270);
  assert.deepEqual(audit.unknownIds, []);
  for (const id of ["8.7-05", "8.13-12", "8.16-03", "8.19-04", "8.19-25"]) {
    assert.ok(audit.evidenceById[id]?.length, `${id} 자동 테스트 증거가 없습니다.`);
  }
  assert.equal(audit.mappedIds.length + audit.missingIds.length, 270);
});

test("이번 수정 계획의 44개 대상 계약은 모두 자동 테스트에 연결한다", () => {
  assert.equal(PLAN_TARGET_IDS.length, 44);
  assert.doesNotThrow(() => requirePlanTargetMappings(audit));
});

test("감사기 자체와 생성 캐시는 계약 테스트 증거로 세지 않는다", () => {
  const evidencePaths = Object.values(audit.evidenceById).flat();

  assert.ok(!evidencePaths.includes("scripts/dev/check-mes-regression-contract-mapping.test.mjs"));
  assert.ok(!evidencePaths.some((evidencePath) => evidencePath.endsWith(".pyc")));
  assert.ok(!evidencePaths.some((evidencePath) => evidencePath.includes("/__pycache__/")));
  assert.ok(audit.evidenceById["8.16-03"]?.includes("backend/tests/test_io_v2.py"));
  assert.ok(
    audit.evidenceById["8.19-25"]?.includes(
      "backend/tests/routers/test_admin_inventory_integrity.py",
    ),
  );
});

test("완료 관문은 270개 중 하나라도 자동 테스트 연결이 없으면 실패한다", () => {
  const incompleteAudit = {
    ...audit,
    missingIds: ["8.1-01"],
  };
  assert.throws(
    () => requireCompleteContractMappings(incompleteAudit),
    /계약 ID 자동 테스트 연결 누락/,
  );
});
