---
type: file-explanation
source_path: "_attic/frontend/_archive/standalone-app-routes/bom/page.tsx"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# page.tsx — page.tsx 설명

## 이 파일은 무엇을 책임지나

`page.tsx`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomPage`
- `TreeNode`
- `BOMEntry`
- `BOMTreeNode`
- `Item`
- `ProductionCheckResponse`
- `ProductionReceiptResponse`

## 연결되는 파일

- [[ERP/_attic/frontend/_archive/standalone-app-routes/bom/📁_bom]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type BOMEntry,
  type BOMTreeNode,
  type Item,
  type ProductionCheckResponse,
  type ProductionReceiptResponse,
} from "@/lib/api";

function TreeNode({ node, depth = 0 }: { node: BOMTreeNode; depth?: number }) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-100">{node.item_name}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">{node.item_code}</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>필요 수량 {Number(node.required_quantity).toLocaleString()}</p>
            <p>현재고 {Number(node.current_stock).toLocaleString()}</p>
          </div>
        </div>
      </div>
      {node.children.map((child) => (
        <TreeNode key={`${node.item_id}-${child.item_id}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function BomPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [parentSearch, setParentSearch] = useState("");
  const [childSearch, setChildSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<Item | null>(null);
  const [selectedChild, setSelectedChild] = useState<Item | null>(null);
  const [bomEntries, setBomEntries] = useState<BOMEntry[]>([]);
  const [bomTree, setBomTree] = useState<BOMTreeNode | null>(null);
  const [productionCheck, setProductionCheck] = useState<ProductionCheckResponse | null>(null);
  const [productionResult, setProductionResult] = useState<ProductionReceiptResponse | null>(null);
  const [bomQuantity, setBomQuantity] = useState("1");
  const [productionQuantity, setProductionQuantity] = useState("1");
  const [unit, setUnit] = useState("EA");
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
```
