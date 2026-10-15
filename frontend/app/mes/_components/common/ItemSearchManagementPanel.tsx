"use client";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { SlidePanel } from "./SlidePanel";
import { DesktopPanelCloseButton, DesktopRightPanel } from "../DesktopRightPanel";
import { SynonymGroupManager } from "./SynonymGroupManager";

/** Reuse the dashboard's existing right panel and mobile sheet frames. */
export function ItemSearchManagementPanel({ open, onClose, mobile = false }: { open: boolean; onClose: () => void; mobile?: boolean }) {
  if (mobile) return <BottomSheet open={open} onClose={onClose} title="같은 뜻의 검색어" keepMounted>
    <div className="px-5"><SynonymGroupManager /></div>
  </BottomSheet>;
  return <SlidePanel open={open} onClose={onClose} hideCloseButton labelledBy="item-search-management-title">
    <DesktopRightPanel title="같은 뜻의 검색어" titleId="item-search-management-title" headerAlign="center" headerAction={<DesktopPanelCloseButton onClick={onClose} ariaLabel="같은 뜻의 검색어 닫기" className="flex h-11 w-11 items-center justify-center rounded-full active:scale-95" />}>
      <SynonymGroupManager />
    </DesktopRightPanel>
  </SlidePanel>;
}
