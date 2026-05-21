---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/frontend/_archive/standalone-app-routes/admin/page.tsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# page.tsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/frontend/_archive/standalone-app-routes/admin/page.tsx]]

## 원본 첫 줄 (또는 메타)

```
"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, KeyRound, Lock, Plus, Trash2, Users } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type Department,
  type Employee,
  type EmployeeLevel,
  type Item,
  type ShipPackage,
} from "@/lib/api";

const DEPARTMENTS: Department[] = [
  "조립",
  "고압",
  "진공",
  "튜닝",
  "튜브",
  "AS",
  "연구",
  "영업",
  "출하",
```
