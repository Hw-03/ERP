"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 문자열 선택 집합을 toggle 방식으로 관리하는 범용 hook.
 * 필터 칩(부서/모델/공정/작업 등)에서 "값이 있으면 빼고 없으면 넣는" 중복 패턴을 통합한다.
 *
 * 사용 예시:
 *   const { selected: selectedDepts, toggle: toggleDept, setSelected: setSelectedDepts } =
 *     useToggleSet(() => setDisplayLimit(PAGE_SIZE)); // 토글 시 페이지네이션 리셋
 *
 * @param onChange toggle 이 일어날 때마다 호출(예: 페이지네이션 리셋). setSelected/clear 에는 호출하지 않는다.
 */
export function useToggleSet(onChange?: () => void) {
  const [selected, setSelected] = useState<string[]>([]);

  // onChange 를 ref 에 보관 → toggle 식별자를 안정화하면서도 항상 최신 콜백을 사용한다 (useResource 와 동일 패턴).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const toggle = useCallback((value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
    onChangeRef.current?.();
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  return { selected, toggle, setSelected, clear };
}
