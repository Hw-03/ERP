"use client";

import { useEffect, useState } from "react";
import { api, type ProductModel } from "@/lib/api";

export function useModels() {
  const [models, setModels] = useState<ProductModel[]>([]);
  useEffect(() => {
    let cancelled = false;
    void api
      .getModels()
      .then((data) => {
        if (!cancelled) setModels(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return models;
}
