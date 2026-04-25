"use client";

import { FileDown } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";

type Props = {
  itemsExportUrl: string;
  transactionsExportUrl: string;
};

export function AdminExportSection({ itemsExportUrl, transactionsExportUrl }: Props) {
  return (
    <div className="overflow-y-auto">
      <div className="grid gap-4 xl:grid-cols-2">
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <FileDown className="h-4 w-4" /> 품목 엑셀
          </div>
          <p className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            현재 등록된 전체 품목을 엑셀 파일로 내보냅니다.
          </p>
          <a
            href={itemsExportUrl}
            download
            className="block w-full rounded-[18px] px-4 py-3 text-center text-sm font-semibold text-white"
            style={{ background: LEGACY_COLORS.green }}
          >
            품목 다운로드
          </a>
        </div>
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <FileDown className="h-4 w-4" /> 거래 엑셀
          </div>
          <p className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            전체 입출고 거래 내역을 엑셀 파일로 내보냅니다.
          </p>
          <a
            href={transactionsExportUrl}
            download
            className="block w-full rounded-[18px] px-4 py-3 text-center text-sm font-semibold text-white"
            style={{ background: LEGACY_COLORS.green }}
          >
            거래 내역 다운로드
          </a>
        </div>
      </div>
    </div>
  );
}
