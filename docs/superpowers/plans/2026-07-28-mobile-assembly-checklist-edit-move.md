> **추천 모델: GPT-5.6 Terra** - 백엔드 API와 모바일 React 화면을 함께 다루는 중간 규모 통합 작업에 적합하다.
> **추천 추론 수준: 높음** - 두 박스의 순서를 원자적으로 재계산하고 포인터 드래그 상태를 안전하게 연결해야 한다.
> **추천 실행 형태: 서브에이전트 활용** - 백엔드 계약과 프런트 API 래퍼는 병렬화하고, 같은 화면 파일의 통합과 최종 검증은 부모 세션에서 수행한다.

# 모바일 조립 체크리스트 편집·이동 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 모바일 조립 체크리스트의 선택 화면 계층을 정리하고 항목 문구 수정 및 박스 간 드래그 이동을 영구 저장하며 관련 테스트를 통과시킨다.

**Goal:** 제품 선택 화면을 간결하게 다듬고, 관리 화면에서 항목을 인라인 수정하거나 다른 박스의 원하는 위치로 이동할 수 있게 한다.

**Architecture:** 기존 체크리스트 테이블의 `content`, `section_id`, `sort_order`를 그대로 사용하고 문구 수정 API와 원자적 이동 API만 추가한다. 프런트는 query mutation이 반환한 최신 체크리스트를 기존 캐시 갱신 경로에 넣고, 관리 상세의 단일 드래그 훅이 모든 박스를 드롭 대상으로 관리한다.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, React 18, TypeScript, TanStack Query, Vitest, Testing Library, Pointer Events

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** — 백엔드+프런트 통합, API 계약, 모바일 상호작용을 함께 구현하는 일반적인 DEXCOWIN MES 기능 작업이다.

**추천 추론 수준: 높음** — 출발·도착 박스의 순서 보존과 같은 박스 재정렬 회귀 방지에 의미 있는 판단이 필요하다.

**팀 구성: 필요** — 백엔드 API와 프런트 API 래퍼는 파일 충돌 없이 병렬 진행할 수 있으며, 화면 통합은 그 뒤 한 작업자가 맡는다.

**커밋 정책:** 프로젝트 지침에 따라 커밋·푸시·브랜치 변경은 수행하지 않는다.

---

## 파일 구조

- Modify: `backend/app/schemas/assembly_checklist.py` — 문구 수정·항목 이동 요청 스키마
- Modify: `backend/app/routers/assembly_checklists.py` — 문구 수정과 원자적 박스 간 이동 API
- Modify: `backend/tests/routers/test_assembly_checklists.py` — 백엔드 계약·정렬 회귀 테스트
- Modify: `frontend/lib/api/assembly-checklists.ts` — 새 PUT 요청 래퍼
- Modify: `frontend/lib/queries/useAssemblyChecklistsQuery.ts` — 최신 체크리스트 캐시를 갱신하는 mutation hooks
- Create: `frontend/lib/api/__tests__/assembly-checklists.test.ts` — 프런트 API 경로·payload 계약 테스트
- Create: `frontend/app/mes/_components/mobile/screens/useAssemblyChecklistItemDrag.ts` — 전체 박스를 대상으로 하는 포인터 드래그 훅
- Modify: `frontend/app/mes/_components/mobile/screens/MobileAssemblyChecklistScreen.tsx` — 제목 계층, 인라인 수정 UI, 드래그 통합
- Modify: `frontend/app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx` — 화면 동작·mutation 연결 테스트

### Task 1: 백엔드 항목 수정·이동 API `[GPT-5.6 Terra] [병렬 가능]`

**Files:**
- Modify: `backend/tests/routers/test_assembly_checklists.py`
- Modify: `backend/app/schemas/assembly_checklist.py`
- Modify: `backend/app/routers/assembly_checklists.py`

- [ ] **Step 1: 문구 수정 실패 테스트 작성**

`backend/tests/routers/test_assembly_checklists.py`에 기존 `_model` helper를 사용해 체크리스트·박스·항목을 만든 뒤 다음 계약을 검증한다.

```python
def test_assembly_checklist_item_update_persists_trimmed_content(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    client.post("/api/assembly-checklists", json={"model_slot": 1})
    section = client.post(
        "/api/assembly-checklists/1/sections", json={"title": "전원 OFF"}
    ).json()["sections"][0]
    item = client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "기존 문구"},
    ).json()["sections"][0]["items"][0]

    updated = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}",
        json={"content": "  수정 문구  "},
    )

    assert updated.status_code == 200
    assert updated.json()["sections"][0]["items"][0]["content"] == "수정 문구"
    assert client.get("/api/assembly-checklists").json()[0]["sections"][0]["items"][0]["content"] == "수정 문구"
    assert client.put(
        f"/api/assembly-checklists/items/{item['item_id']}", json={"content": "   "}
    ).status_code == 422
    assert client.put(
        f"/api/assembly-checklists/items/{uuid.uuid4()}", json={"content": "수정"}
    ).status_code == 404
```

- [ ] **Step 2: 문구 수정 테스트가 예상대로 실패하는지 확인**

Run:

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_assembly_checklists.py::test_assembly_checklist_item_update_persists_trimmed_content -q
```

Expected: 새 PUT 경로가 없어 `405 Method Not Allowed`로 실패한다.

- [ ] **Step 3: 박스 간 이동 실패 테스트 작성**

같은 체크리스트의 A 박스 두 항목 중 첫 항목을 B 박스의 기존 항목 앞(`target_index=0`)으로 옮긴다. 응답과 후속 GET 모두에서 항목 ID·문구가 유지되고 양쪽 `sort_order`가 `0..N-1`인지 검증한다. 빈 박스로 이동할 때 `target_index=0`을 허용하고, 다른 체크리스트의 박스·범위 밖 인덱스·없는 대상 박스를 각각 422/422/404로 검증한다.

```python
moved = client.put(
    f"/api/assembly-checklists/items/{moving_item_id}/move",
    json={"target_section_id": target_section_id, "target_index": 0},
)
assert moved.status_code == 200
assert [item["item_id"] for item in moved.json()["sections"][0]["items"]] == [remaining_item_id]
assert [item["item_id"] for item in moved.json()["sections"][1]["items"]] == [moving_item_id, target_item_id]
assert [item["sort_order"] for item in moved.json()["sections"][0]["items"]] == [0]
assert [item["sort_order"] for item in moved.json()["sections"][1]["items"]] == [0, 1]
```

- [ ] **Step 4: 이동 테스트가 예상대로 실패하는지 확인**

Run:

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_assembly_checklists.py -q -k "item_move"
```

Expected: 새 move 경로가 없어 `405 Method Not Allowed`로 실패한다.

- [ ] **Step 5: 요청 스키마와 최소 API 구현**

`backend/app/schemas/assembly_checklist.py`에 다음 스키마를 추가한다.

```python
class AssemblyChecklistItemUpdate(BaseModel):
    content: str = Field(..., max_length=2000)


class AssemblyChecklistItemMove(BaseModel):
    target_section_id: uuid.UUID
    target_index: int = Field(..., ge=0)
```

`backend/app/routers/assembly_checklists.py`에서 두 스키마를 import하고 다음 동작을 구현한다.

```python
@router.put("/items/{item_id}", response_model=AssemblyChecklistResponse, summary="조립 체크리스트 항목 수정")
def update_assembly_checklist_item(
    item_id: uuid.UUID,
    payload: AssemblyChecklistItemUpdate,
    db: Session = Depends(get_db),
):
    """Persist one trimmed instruction and return its latest checklist."""
    item = _get_item(db, item_id)
    content = payload.content.strip()
    if not content:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "체크 항목을 입력하세요.")
    model_slot = item.section.checklist.model_slot
    item.content = content
    db.commit()
    return _serialize(_latest_checklist(db, model_slot))
```

이동 endpoint는 `(sort_order, item_id)`로 출발·도착 목록을 읽고, 이동 항목을 출발 목록에서 제거한 뒤 `target_index`에 삽입한다. 같은 박스면 하나의 목록만 재번호화하고, 다른 박스면 두 목록을 각각 0부터 재번호화한 뒤 `item.section_id`를 대상 박스로 바꾼다. 대상 인덱스 검증 이후 단 한 번 `db.commit()`한다.

```python
@router.put("/items/{item_id}/move", response_model=AssemblyChecklistResponse, summary="조립 체크리스트 항목 이동")
def move_assembly_checklist_item(
    item_id: uuid.UUID,
    payload: AssemblyChecklistItemMove,
    db: Session = Depends(get_db),
):
    """Move one item atomically and keep affected section orders contiguous."""
    item = _get_item(db, item_id)
    source_section = item.section
    target_section = _get_section(db, payload.target_section_id)
    if source_section.checklist_id != target_section.checklist_id:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "같은 체크리스트 안에서만 항목을 이동할 수 있습니다.")

    source_items = (
        db.query(AssemblyChecklistItem)
        .filter(AssemblyChecklistItem.section_id == source_section.section_id)
        .order_by(AssemblyChecklistItem.sort_order.asc(), AssemblyChecklistItem.item_id.asc())
        .all()
    )
    source_items.remove(item)
    if source_section.section_id == target_section.section_id:
        target_items = source_items
    else:
        target_items = (
            db.query(AssemblyChecklistItem)
            .filter(AssemblyChecklistItem.section_id == target_section.section_id)
            .order_by(AssemblyChecklistItem.sort_order.asc(), AssemblyChecklistItem.item_id.asc())
            .all()
        )
    if payload.target_index > len(target_items):
        raise http_error(422, ErrorCode.UNPROCESSABLE, "이동 위치가 항목 범위를 벗어났습니다.")

    target_items.insert(payload.target_index, item)
    item.section_id = target_section.section_id
    for sort_order, source_item in enumerate(source_items):
        source_item.sort_order = sort_order
    for sort_order, target_item in enumerate(target_items):
        target_item.sort_order = sort_order
    db.commit()
    return _serialize(_latest_checklist(db, target_section.checklist.model_slot))
```

- [ ] **Step 6: 백엔드 테스트 통과 확인**

Run:

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_assembly_checklists.py -q
```

Expected: 기존 생성·삭제·동일 박스 reorder 테스트와 새 수정·이동 테스트가 모두 PASS한다.

### Task 2: 프런트 API·query mutation 계약 `[GPT-5.6 Terra] [병렬 가능]`

**Files:**
- Create: `frontend/lib/api/__tests__/assembly-checklists.test.ts`
- Modify: `frontend/lib/api/assembly-checklists.ts`
- Modify: `frontend/lib/queries/useAssemblyChecklistsQuery.ts`

- [ ] **Step 1: 새 API 요청 실패 테스트 작성**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-core", () => ({
  deleteJson: vi.fn(),
  fetcher: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));

import { putJson } from "@/lib/api-core";
import { assemblyChecklistsApi } from "../assembly-checklists";

describe("assemblyChecklistsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("항목 문구를 수정한다", async () => {
    vi.mocked(putJson).mockResolvedValueOnce({} as never);
    await assemblyChecklistsApi.updateAssemblyChecklistItem("item-1", { content: "수정" });
    expect(putJson).toHaveBeenCalledWith("/api/assembly-checklists/items/item-1", { content: "수정" });
  });

  it("항목을 대상 박스 위치로 이동한다", async () => {
    vi.mocked(putJson).mockResolvedValueOnce({} as never);
    await assemblyChecklistsApi.moveAssemblyChecklistItem("item-1", {
      target_section_id: "section-2",
      target_index: 1,
    });
    expect(putJson).toHaveBeenCalledWith("/api/assembly-checklists/items/item-1/move", {
      target_section_id: "section-2",
      target_index: 1,
    });
  });
});
```

- [ ] **Step 2: API 테스트가 예상대로 실패하는지 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- lib/api/__tests__/assembly-checklists.test.ts
```

Expected: 두 메서드가 없어 TypeScript/Vitest가 FAIL한다.

- [ ] **Step 3: API 래퍼와 최신 응답 mutation hooks 구현**

`frontend/lib/api/assembly-checklists.ts`에 다음 메서드를 추가한다.

```typescript
updateAssemblyChecklistItem: (itemId: string, payload: { content: string }) =>
  putJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/items/${itemId}`), payload),

moveAssemblyChecklistItem: (
  itemId: string,
  payload: { target_section_id: string; target_index: number },
) => putJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/items/${itemId}/move`), payload),
```

`frontend/lib/queries/useAssemblyChecklistsQuery.ts`에 기존 `useLatestChecklistMutation`을 재사용하는 hooks를 추가한다.

```typescript
export function useUpdateAssemblyChecklistItemMutation() {
  return useLatestChecklistMutation(({ itemId, content }: { itemId: string; content: string }) =>
    assemblyChecklistsApi.updateAssemblyChecklistItem(itemId, { content }),
  );
}

export function useMoveAssemblyChecklistItemMutation() {
  return useLatestChecklistMutation(({
    itemId,
    targetSectionId,
    targetIndex,
  }: {
    itemId: string;
    targetSectionId: string;
    targetIndex: number;
  }) => assemblyChecklistsApi.moveAssemblyChecklistItem(itemId, {
    target_section_id: targetSectionId,
    target_index: targetIndex,
  }));
}
```

- [ ] **Step 4: API 테스트 통과 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- lib/api/__tests__/assembly-checklists.test.ts
```

Expected: 두 경로와 payload 검증이 PASS한다.

### Task 3: 선택 화면 계층과 항목 인라인 수정 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx`
- Modify: `frontend/app/mes/_components/mobile/screens/MobileAssemblyChecklistScreen.tsx`

- [ ] **Step 1: 헤더·제품 카드 실패 테스트 작성**

기존 test state mock에 `updateItem`, `moveItem`을 추가하고 query module mock에서 새 mutation hooks를 반환한다. 선택 화면에서 보조문구가 없고 제목·모델명이 커졌는지 검증한다.

```typescript
it("removes repeated checklist captions and enlarges the title and model names", () => {
  renderChecklistScreen();

  const title = screen.getByRole("heading", { name: "조립 체크리스트" });
  expect(title).toHaveClass("text-2xl", "font-black");
  expect(screen.queryByText("제품을 선택하세요.")).not.toBeInTheDocument();
  expect(screen.queryAllByText("조립 체크리스트")).toHaveLength(1);
  expect(screen.getByText("DX3000")).toHaveClass("text-xl", "font-black");
});
```

- [ ] **Step 2: 헤더 테스트가 예상대로 실패하는지 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx -t "removes repeated"
```

Expected: 제목이 heading이 아니고 보조문구가 남아 있어 FAIL한다.

- [ ] **Step 3: 인라인 수정 실패 테스트 작성**

```typescript
it("edits a managed checklist item inline and saves trimmed content", async () => {
  state.updateItem.mockResolvedValueOnce(state.checklists[0]);
  renderChecklistScreen();
  fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

  fireEvent.click(screen.getByRole("button", {
    name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정",
  }));
  const editor = screen.getByRole("textbox", {
    name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 문구",
  });
  fireEvent.change(editor, { target: { value: "  손잡이 체결 확인  " } });
  fireEvent.click(screen.getByRole("button", { name: "항목 수정 저장" }));

  await waitFor(() => expect(state.updateItem).toHaveBeenCalledWith({
    itemId: "dx-off-1",
    content: "손잡이 체결 확인",
  }));
});
```

취소 버튼을 누르면 mutation이 호출되지 않고 원래 문구 버튼이 복구되는 테스트도 별도로 추가한다.

- [ ] **Step 4: 인라인 수정 테스트가 예상대로 실패하는지 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx -t "edits a managed"
```

Expected: 수정 진입 버튼과 update mutation이 없어 FAIL한다.

- [ ] **Step 5: 최소 선택 화면·인라인 수정 구현**

`ProductCard`의 caption을 삭제하고 모델명에 `text-xl font-black`을 적용한다. 선택 화면 상단의 제목 span을 heading으로 바꾸고 `TYPO.display`를 사용한다.

```tsx
<h2 className={`${TYPO.display} min-w-0 flex-1 truncate leading-tight`} style={{ color: LEGACY_COLORS.text }}>
  조립 체크리스트
</h2>
```

`ManagedSection`에 `onUpdateItem`을 전달하고 `editingItemId`, `editDraft` state를 둔다. 일반 상태에서는 문구 자체를 semantic button으로 렌더링하고, 편집 상태에서는 textarea와 44px `취소`·`저장` 버튼을 표시한다.

```tsx
<button
  type="button"
  aria-label={`${item.content} 수정`}
  onClick={() => {
    setEditingItemId(item.item_id);
    setEditDraft(item.content);
  }}
  className={`${TYPO.body} no-btn-inset min-h-11 min-w-0 flex-1 whitespace-pre-line text-left`}
  style={{ color: LEGACY_COLORS.text }}
>
  {item.content}
</button>
```

저장은 `editDraft.trim()`이 비지 않을 때만 `await onUpdateItem(item.item_id, content)`를 호출하고 성공 후 편집 state를 초기화한다. 취소는 서버 호출 없이 state만 초기화한다. `ManageDetail`은 `useUpdateAssemblyChecklistItemMutation`을 사용하고 실패 시 `항목 문구를 저장하지 못했습니다.`를 표시하며, `pending` 계산에 새 mutation을 포함한다.

- [ ] **Step 6: 선택 화면·인라인 수정 테스트 통과 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx
```

Expected: 새 계층·수정 테스트와 기존 조회·추가·삭제 테스트가 PASS한다. 이동 테스트는 Task 4 전까지 아직 추가하지 않는다.

### Task 4: 박스 간 드래그 훅과 화면 통합 `[GPT-5.6 Terra] [순차]`

**Files:**
- Create: `frontend/app/mes/_components/mobile/screens/useAssemblyChecklistItemDrag.ts`
- Modify: `frontend/app/mes/_components/mobile/screens/MobileAssemblyChecklistScreen.tsx`
- Modify: `frontend/app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx`

- [ ] **Step 1: 박스 간 이동 실패 테스트 작성**

기존 pointer test 패턴을 따라 `dx-off-1` 핸들을 `dx-on-1` 행에 드롭하고 move mutation payload를 검증한다.

```typescript
it("moves a dragged item to another box at the target row", async () => {
  state.moveItem.mockResolvedValueOnce(state.checklists[0]);
  renderChecklistScreen();
  fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

  const handle = screen.getByRole("button", {
    name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 순서 변경",
  });
  const target = screen.getByText("펌웨어가 정상적으로 들어갔는지 확인").closest("[data-checklist-item-id]");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => target),
  });
  Object.defineProperty(handle, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });

  fireEvent.pointerDown(handle, { pointerId: 1, clientY: 10 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 30, clientX: 1 });
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 30, clientX: 1 });

  await waitFor(() => expect(state.moveItem).toHaveBeenCalledWith({
    itemId: "dx-off-1",
    targetSectionId: "dx-on",
    targetIndex: 0,
  }));
});
```

빈 박스 또는 박스의 빈 영역을 `elementFromPoint` 대상으로 반환해 `targetIndex === target.items.length`가 호출되는 테스트도 추가한다. 기존 같은 박스 reorder 테스트는 그대로 유지한다.

- [ ] **Step 2: 박스 간 이동 테스트가 예상대로 실패하는지 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx -t "moves a dragged item"
```

Expected: 현재 section별 drag hook은 다른 박스 ID를 찾지 못해 move mutation이 호출되지 않는다.

- [ ] **Step 3: 전체 박스 포인터 드래그 훅 구현**

`useAssemblyChecklistItemDrag.ts`는 `AssemblyChecklistSection[]`, `onReorder`, `onMove`를 받고 `dragId`, `dropTargetItemId`, `dropTargetSectionId`, `makeHandlers(sectionId, itemId)`를 반환한다.

핵심 계약:

```typescript
interface MovePayload {
  itemId: string;
  targetSectionId: string;
  targetIndex: number;
}

export function useAssemblyChecklistItemDrag(
  sections: AssemblyChecklistSection[],
  onReorder: (sectionId: string, itemIds: string[]) => void,
  onMove: (payload: MovePayload) => void,
) {
  // pointer down: source section/item과 시작 Y 저장
  // pointer move: 5px 이후 drag 활성화, elementFromPoint에서
  //   [data-checklist-section-id]와 [data-checklist-item-id]를 찾음
  // pointer up: 같은 section이면 기존 splice 재정렬, 다른 section이면
  //   대상 item index 또는 목록 끝 index로 onMove 호출
  // finally: 모든 ref/state 초기화
}
```

`makeHandlers`가 반환하는 style은 기존과 동일하게 `{ touchAction: "none" }`을 유지한다. 대상 행이 없더라도 section 요소가 잡히면 목록 끝으로 이동하며, 드래그 항목·대상 항목·대상 박스를 blue token으로 강조할 수 있도록 상태를 노출한다.

- [ ] **Step 4: 관리 상세에 단일 drag state 연결**

`ManageDetail`에서 모든 section을 받는 새 훅을 한 번만 호출하고 `useMoveAssemblyChecklistItemMutation`을 연결한다. `ManagedSection`별 기존 `useItemOrderDrag` 호출을 제거하고 다음 data attribute를 추가한다.

```tsx
<section data-checklist-section-id={section.section_id} ...>
  <li
    data-checklist-section-id={section.section_id}
    data-checklist-item-id={item.item_id}
    ...
  >
```

이동 실패 문구는 `항목을 다른 박스로 이동하지 못했습니다.`로 하고, move mutation을 `pending` 계산에 포함한다. 같은 박스의 행 위 드롭은 기존 `useReorderAssemblyChecklistItemsMutation` payload를 유지한다.

- [ ] **Step 5: 화면 전체 테스트 통과 확인**

Run:

```powershell
Set-Location C:\ERP\frontend
npm test -- app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx
```

Expected: 같은 박스 reorder, 다른 박스 move, 빈 영역 append, 인라인 수정, 삭제, 선택 화면 계층 테스트가 모두 PASS한다.

### Task 5: 통합 검증과 시각 확인 `[GPT-5.6 Terra] [순차]`

**Files:**
- Verify only; 코드 변경은 실패 원인에 직접 필요한 경우에만 수행한다.

- [ ] **Step 1: 관련 백엔드·프런트 테스트 재실행**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_assembly_checklists.py -q

Set-Location C:\ERP\frontend
npm test -- lib/api/__tests__/assembly-checklists.test.ts app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx
```

Expected: 모든 관련 테스트 PASS, 경고·Unhandled rejection 없음.

- [ ] **Step 2: 변경 파일 정적 검증**

```powershell
Set-Location C:\ERP
git diff --check -- backend/app/schemas/assembly_checklist.py backend/app/routers/assembly_checklists.py backend/tests/routers/test_assembly_checklists.py frontend/lib/api/assembly-checklists.ts frontend/lib/queries/useAssemblyChecklistsQuery.ts frontend/lib/api/__tests__/assembly-checklists.test.ts frontend/app/mes/_components/mobile/screens/useAssemblyChecklistItemDrag.ts frontend/app/mes/_components/mobile/screens/MobileAssemblyChecklistScreen.tsx frontend/app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx
```

Expected: 출력 없음.

- [ ] **Step 3: 변경 범위 게이트 실행**

`efficient-verification` 스킬로 현재 워킹트리의 다른 미커밋 변경을 고려해 범위를 확정한다. 관련 영역을 넓게 건드린 경우 아래 두 게이트를 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode backend
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend
```

Expected: backend/frontend 게이트 PASS. 기존 사용자 변경 때문에 실패하면 이번 변경과의 관련성을 파일·테스트 단위로 분리해 보고한다.

- [ ] **Step 4: 모바일 브라우저 스모크 확인**

`http://192.168.0.63:3001/mes?tab=dashboard`에서 체크리스트 화면을 열어 다음을 확인한다.

- 상단 `제품을 선택하세요.`가 없고 제목이 아이콘·버튼과 수직 중앙에 맞는다.
- 네 제품 카드 모두 보조문구가 없고 모델명이 커졌다.
- DX3000 관리에서 문구 수정 저장·취소가 동작한다.
- 전원 OFF 항목을 전원 ON의 행 앞과 박스 맨 아래로 각각 이동할 수 있다.
- 같은 박스 재정렬과 기존 삭제·항목 추가가 유지된다.

- [ ] **Step 5: 완료 상태 확인**

`git status --short`로 이번 작업 파일과 기존 사용자 변경을 구분하고, 커밋·푸시 없이 테스트 결과와 변경 파일만 보고한다.
