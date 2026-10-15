"use client";
import { usePathname } from "next/navigation";
import { RecoveryScreen } from "./RecoveryScreen";
import { MesRouteRecovery } from "./mes/_components/MesRouteRecovery";

export default function NotFound() {
  const pathname = usePathname();
  if (pathname === "/mes" || pathname?.startsWith("/mes/")) return <MesRouteRecovery />;
  return <RecoveryScreen title="페이지를 찾을 수 없습니다" description="주소가 올바른지 확인하거나 대시보드에서 필요한 화면을 찾아주세요." />;
}
