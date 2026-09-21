import { useState, type ReactNode } from "react";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { DesktopTabHomeProvider, useDesktopTabHome, useDesktopTabHomeController } from "../DesktopTabHome";

/** Real navigation/dirty providers; the fixture owns only the surrounding hub. */
export function DesktopHomeHarness({ children }: { children: ReactNode }) {
  return <DirtyGuardProvider><DesktopTabHomeProvider><Owner>{children}</Owner></DesktopTabHomeProvider></DirtyGuardProvider>;
}
function Owner({ children }: { children: ReactNode }) {
  const [home, setHome] = useState(false);
  const { requestHome } = useDesktopTabHomeController();
  useDesktopTabHome("fixture-owner", { isHome: home, returnHome: () => setHome(true) });
  return <><button onClick={() => requestHome()}>현재 메뉴 복귀</button>{home ? <div>메뉴 첫 화면</div> : children}</>;
}
