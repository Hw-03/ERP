"use client";

import { SkeletonBlock } from "../../common/LoadingSkeleton";
import { LEGACY_COLORS } from "@/lib/mes/color";
import styles from "./AdminMasterData.module.css";
import deptStyles from "../AdminDepartmentsSection.module.css";
import { SIDEBAR_TAB_IDS } from "../../tabAccess";
import { DetailCardSlot, FieldRow } from "../_employee_parts/employeeDetailPrimitives";
import { DetailCardSlot as DepartmentDetailCardSlot } from "../_department_parts/departmentDetailPrimitives";

/** 실제 표의 열 배치와 행 높이를 받아 같은 자리에 값을 예약한다. */
export function AdminTableSkeleton({ columns, count, rowClassName = "h-[51px]", rows = 8 }: {
  columns: string; count: number; rowClassName?: string; rows?: number;
}) {
  return <div aria-hidden="true" data-testid="admin-table-skeleton">
    {Array.from({ length: rows }, (_, index) => <div key={index} className={`grid items-center gap-2 border-b px-3 ${rowClassName}`}
      style={{ gridTemplateColumns: columns, borderColor: LEGACY_COLORS.border }}>
      {Array.from({ length: count }, (_, column) => <SkeletonBlock key={column} className={`h-3 ${column === 0 ? "w-3/4" : "mx-auto w-2/3"}`} />)}
    </div>)}
  </div>;
}

function Field({ label, card = false, large = false }: { label: string; card?: boolean; large?: boolean }) {
  return <div className={card ? styles.fieldCard : "min-w-0"}>
    <div className={large ? "mb-2 text-sm font-bold" : "mb-1.5 text-[12px] font-bold"} style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
    <SkeletonBlock className={`${large ? "h-[50px] rounded-[18px]" : "h-11 rounded-[12px]"} w-full`} />
  </div>;
}

/** 상세 화면의 실 레이아웃 클래스를 공유해 로딩 해제 시 필드가 이동하지 않는다. */
export function AdminDetailSkeleton({ variant }: { variant: "models" | "employees" | "departments" | "items" }) {
  if (variant === "items") return <div aria-hidden="true" data-testid="admin-detail-skeleton" className="flex min-h-full flex-col gap-4">
    <div className={styles.itemForm}>
      {[["품목명"], ["사용 제품"], ["부서", "공정 단계"], ["자재분류", "단위"], ["품목 코드"]].map((labels, index) =>
        <div key={index} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
          {labels.map((label) => <Field key={label} label={label} large />)}
        </div>)}
    </div>
    <SkeletonBlock className="h-[66px] w-full shrink-0 rounded-[18px]" />
    <SkeletonBlock className="h-[66px] w-full shrink-0 rounded-[18px]" />
  </div>;
  const fields = variant === "models" ? ["모델명", "기호 (1-5자)", "연결 품목 수", "연결 BOM 수"]
    : variant === "employees" ? ["사번", "이름", "직급", "부서", "연락처"] : ["부서명", "코드", "소속 직원", "관련 품목"];
  const fieldGrid = variant === "models" ? styles.modelFields : variant === "employees" ? styles.employeeFields : deptStyles.metaGrid;
  return <div aria-hidden="true" data-testid="admin-detail-skeleton" className={`flex min-h-full flex-1 flex-col gap-3 ${variant === "departments" ? deptStyles.detailLayout : ""}`}>
    <div className={styles.detailHeader}>
      <div className={fieldGrid}>{fields.map((label) => variant === "employees"
        ? <FieldRow key={label} label={label}><SkeletonBlock className="h-11 w-full rounded-[12px]" /></FieldRow>
        : <Field key={label} label={label} card />)}</div>
      <SkeletonBlock className="h-11 w-[88px] shrink-0 rounded-[12px]" />
    </div>
    {variant === "models" ? <div className={`${styles.panel} flex min-h-0 flex-1 flex-col`}>
      <div className="mb-3 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>연결 품목 미리보기</div>
      <div className={styles.preview}>{Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.previewRow}>
        <SkeletonBlock className="h-5 w-2/3" /><SkeletonBlock className="ml-auto h-3 w-20" />
      </div>)}<SkeletonBlock className="mt-1 h-4 w-16" /></div>
    </div> : variant === "employees" ? <div className={styles.employeeCards}>
      <div className={styles.employeeLeft}>
      <DetailCardSlot title="결재 권한">
        <div className={styles.employeePermissions}>{["창고 결재 권한", "부서 결재 권한", "AS·연구 승인 권한"].map((label) =>
          <FieldRow key={label} label={label}><SkeletonBlock className="h-12 w-full rounded-[10px]" /></FieldRow>)}
        </div>
      </DetailCardSlot>
      <DetailCardSlot title="PIN·계정 관리" className="flex-1">
        <div className={styles.employeeAccountRows}>
          {[1, 2].map((row) => <div key={row} className={styles.employeeAccountRow}>
            <div className="flex flex-col gap-2"><SkeletonBlock className="h-5 w-24" /><SkeletonBlock className="h-3 w-32" /></div>
            <div className="flex gap-2">{Array.from({ length: row }, (_, index) => <SkeletonBlock key={index} className="h-12 w-28 rounded-[10px]" />)}</div>
          </div>)}
        </div>
      </DetailCardSlot>
      </div>
      <DetailCardSlot title="메뉴 표시" className="h-full">
        <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2">{SIDEBAR_TAB_IDS.map((tab) =>
          <SkeletonBlock key={tab} className="min-h-14 w-full rounded-[10px]" />)}</div>
      </DetailCardSlot>
    </div> : <>
      <p className="-mt-2 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>품목 코드 공정 기준</p>
      <div className={deptStyles.detailCards}>
      <DepartmentDetailCardSlot title="소속 직원" className="min-h-0 flex-1">
        <div className="flex flex-wrap gap-2">{[0, 1, 2].map((index) => <SkeletonBlock key={index} className="h-10 w-28 rounded-[12px]" />)}</div>
      </DepartmentDetailCardSlot>
      <DepartmentDetailCardSlot title="색상" className="min-h-0 flex-1">
        <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3"><SkeletonBlock className="h-9 w-9 rounded-full" /><SkeletonBlock className="h-11 w-36 rounded-[12px]" /></div>
        <SkeletonBlock className="h-11 w-full rounded-[12px]" />
        </div>
      </DepartmentDetailCardSlot>
      </div>
    </>}
    {variant === "departments" ? <div className={`${deptStyles.dangerActions} mt-auto flex shrink-0 gap-2`}>
      <SkeletonBlock className="h-11 flex-1 rounded-[12px]" /><SkeletonBlock className="h-11 w-24 rounded-[12px]" />
    </div> : variant === "models" && <SkeletonBlock className="mt-auto h-12 w-full shrink-0 rounded-[12px]" />}
  </div>;
}

/** 로그 다운로드 카드의 실제 두 열 선택 영역과 하단 버튼 자리. */
export function AdminDownloadSkeleton() {
  return <div role="status" aria-label="파일 목록 불러오는 중" aria-busy="true" className="flex min-h-0 flex-1 flex-col">
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
      {["대상 월", "파일 형식"].map((label) => <Field key={label} label={label} />)}
    </div>
    <div aria-hidden="true" className="mt-auto pt-4"><SkeletonBlock className="h-11 w-full rounded-[12px]" /></div>
  </div>;
}
