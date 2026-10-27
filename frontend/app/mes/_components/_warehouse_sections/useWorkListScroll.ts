import { useState, type KeyboardEventHandler, type UIEventHandler, type WheelEventHandler } from "react";

interface WorkListScroll {
  listScrolled: boolean;
  onScroll: UIEventHandler<HTMLDivElement>;
  onWheel: WheelEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

/** 탭을 접어 목록이 화면에 모두 들어와도, 자동 스크롤 보정으로 다시 펼치지 않는다. */
export function useWorkListScroll(initialScrolled = false, restoring?: { current: boolean }): WorkListScroll {
  const [listScrolled, setListScrolled] = useState(initialScrolled);
  return {
    listScrolled,
    onScroll: (event) => {
      if (restoring?.current) return;
      const viewport = event.currentTarget;
      if (viewport.scrollTop > 0) setListScrolled(true);
      else if (viewport.scrollHeight > viewport.clientHeight) setListScrolled(false);
    },
    onWheel: (event) => {
      if (event.deltaY < 0 && event.currentTarget.scrollTop <= 0) setListScrolled(false);
    },
    onKeyDown: (event) => {
      if (event.key === "Home" || (event.currentTarget.scrollTop <= 0 && (event.key === "ArrowUp" || event.key === "PageUp"))) setListScrolled(false);
    },
  };
}
