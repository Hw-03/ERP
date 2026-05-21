"use client";

import { useEffect, useState } from "react";

/**
 * 품목 이미지 매니페스트 훅.
 *
 * /images/items/manifest.json 을 1회 로드해 { item_code: filename } 맵으로 보관한다.
 * Next.js 정적 파일이라 브라우저 캐시가 알아서 처리. 마운트 1회.
 */
export function useItemImageManifest() {
  const [manifest, setManifest] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetch("/images/items/manifest.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (alive) setManifest(data ?? {});
      })
      .catch(() => {
        if (alive) setManifest({});
      });
    return () => {
      alive = false;
    };
  }, []);

  return manifest;
}
