# 스크롤바만 객체 밖으로 분리하는 작업 요령

## 목적

기존 객체의 크기, 배경, 테두리, 내부 행, sticky 헤더, 가로 스크롤 동작은 그대로 유지하면서 데스크톱 세로 스크롤바만 객체 오른쪽 바깥 레일로 이동한다.

이 작업의 핵심은 한 요소가 맡던 역할을 다음 세 층으로 분리하는 것이다.

1. `shell`: 기존 객체가 차지하던 크기와 위치를 유지한다.
2. `viewport`: 실제 스크롤만 담당하며 오른쪽으로 스크롤바 너비만큼 확장한다.
3. `frame`: 기존 테두리와 둥근 모서리를 원래 객체 위치에 고정한다.

## 기본 원칙

- 기존 표나 목록의 JSX, 열 너비, 행 높이, sticky 위치는 수정하지 않는다.
- 기존 스크롤 요소의 `ref`, `onScroll`, `data-*` 속성은 `viewport`로 그대로 옮긴다.
- 바깥으로 이동시키는 값은 스크롤바 레일 너비만큼만 사용한다.
- 배경과 데이터 콘텐츠는 `viewport` 안에 둔다.
- 테두리와 곡률은 스크롤 콘텐츠에 두지 않고 고정된 `frame`에 둔다.
- 모바일 동작을 유지해야 하면 바깥 레일 이동은 `lg:` 이상에서만 적용한다.

## 1. 기존 구조

보통 기존 코드는 스크롤, 배경, 테두리, 곡률을 한 요소가 모두 담당한다.

```tsx
<div
  ref={scrollRef}
  onScroll={handleScroll}
  className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-[16px] border"
  style={{
    background: LEGACY_COLORS.s2,
    borderColor: LEGACY_COLORS.border,
    overscrollBehavior: "contain",
  }}
>
  {content}
</div>
```

이 요소 자체를 오른쪽으로 넓히면 스크롤바는 밖으로 빠지지만 테두리까지 같이 늘어나거나, 긴 콘텐츠의 끝에 곡률이 붙어 현재 화면 하단이 각져 보이게 된다.

## 2. 스크롤바만 밖으로 빼는 구조

먼저 기존 객체 크기를 유지하는 `relative` shell을 만든다. 실제 viewport는 shell보다 오른쪽으로 `10px`만 확장한다.

```tsx
<div className="relative min-h-0 flex-1">
  <div
    ref={scrollRef}
    onScroll={handleScroll}
    data-keep-scroll
    className="absolute inset-y-0 left-0 right-0 overflow-y-auto overflow-x-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]"
    style={{ overscrollBehavior: "contain" }}
  >
    <div
      className="min-h-full min-w-full"
      style={{ background: LEGACY_COLORS.s2 }}
    >
      {content}
    </div>
  </div>
</div>
```

### 클래스의 역할

- `relative min-h-0 flex-1`: 기존 객체의 크기를 그대로 유지하는 기준점이다.
- `absolute inset-y-0 left-0 right-0`: viewport가 shell 높이를 정확히 채운다.
- `lg:-right-2.5`: 데스크톱에서 viewport 오른쪽만 `10px` 확장해 스크롤바를 객체 밖으로 이동시킨다.
- `lg:[scrollbar-gutter:stable]`: 스크롤 유무에 따라 열 너비가 흔들리지 않게 레일 공간을 고정한다.
- `min-h-full min-w-full`: 콘텐츠가 적어도 기존 표면 전체를 채우게 한다.

`lg:-right-2.5` 값은 현재 프로젝트의 얇은 스크롤바 레일에 맞춘 값이다. 다른 레일 너비를 사용할 때는 이 값과 프레임의 오른쪽 경계를 함께 확인한다.

## 3. 모서리가 각지는 원인

아래처럼 테두리와 곡률을 긴 스크롤 콘텐츠에 적용하면 문제가 생긴다.

```tsx
<div className="min-h-full rounded-[16px] border">
  {content}
</div>
```

`min-h-full`은 콘텐츠가 많을 때 콘텐츠 높이만큼 길어진다. 따라서 하단 곡률은 현재 viewport 하단이 아니라 전체 콘텐츠의 맨 끝에 생긴다. 스크롤 중에는 화면 하단이 직선으로 잘려 보인다.

또한 sticky 헤더나 행 배경이 둥근 모서리 위로 그려지면 좌우 상단에도 사각형 조각이 노출될 수 있다.

## 4. 고정 프레임으로 테두리와 곡률 복원

테두리는 스크롤 콘텐츠에서 제거하고 shell 위에 고정된 프레임으로 다시 그린다.

```tsx
<div
  aria-hidden
  className="pointer-events-none absolute inset-0 z-20 rounded-[16px] border"
  style={{ borderColor: LEGACY_COLORS.border }}
/>
```

- `absolute inset-0`: 원래 객체의 크기만 사용한다. 바깥 레일까지 따라가지 않는다.
- `pointer-events-none`: 행 클릭, 버튼, 드래그, 스크롤을 방해하지 않는다.
- `z-20`: 스크롤되는 행과 sticky 헤더보다 위에서 테두리를 유지한다.
- `rounded-[16px] border`: 어느 스크롤 위치에서도 같은 곡률과 테두리를 보여준다.

## 5. 네 모서리의 사각형 조각 가리기

고정 프레임만 추가하면 내부 행의 배경이 둥근 테두리 밖 모서리에 비칠 수 있다. shell의 배경색과 같은 방사형 마스크를 네 모서리에 고정한다.

```tsx
<div
  aria-hidden
  className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between"
>
  <div className="flex justify-between">
    <span
      className="h-4 w-4"
      style={{
        background:
          "radial-gradient(circle at 100% 100%, transparent 0 15px, var(--c-s1) 16px)",
      }}
    />
    <span
      className="h-4 w-4"
      style={{
        background:
          "radial-gradient(circle at 0 100%, transparent 0 15px, var(--c-s1) 16px)",
      }}
    />
  </div>

  <div className="flex justify-between">
    <span
      className="h-4 w-4"
      style={{
        background:
          "radial-gradient(circle at 100% 0, transparent 0 15px, var(--c-s1) 16px)",
      }}
    />
    <span
      className="h-4 w-4"
      style={{
        background:
          "radial-gradient(circle at 0 0, transparent 0 15px, var(--c-s1) 16px)",
      }}
    />
  </div>
</div>
```

### 마스크 적용 규칙

- `h-4 w-4`와 gradient의 `15px/16px`는 `rounded-[16px]`에 맞춘 값이다.
- 바깥 shell의 배경이 `--c-s1`이 아니면 반드시 실제 주변 배경 토큰으로 교체한다.
- 원시 색상값을 쓰지 말고 `var(--c-*)` 또는 `LEGACY_COLORS` 토큰을 사용한다.
- 마스크도 `pointer-events-none`이어야 우측 버튼과 첫·마지막 행 클릭을 막지 않는다.

## 6. 완성 구조

```tsx
<div className="relative min-h-0 flex-1">
  {/* 실제 스크롤: 오른쪽 레일만 객체 밖으로 이동 */}
  <div
    ref={scrollRef}
    onScroll={handleScroll}
    data-keep-scroll
    className="absolute inset-y-0 left-0 right-0 overflow-y-auto overflow-x-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]"
    style={{ overscrollBehavior: "contain" }}
  >
    <div className="min-h-full min-w-full" style={{ background: LEGACY_COLORS.s2 }}>
      {content}
    </div>
  </div>

  {/* 원래 객체 크기에 고정되는 테두리 */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 z-20 rounded-[16px] border"
    style={{ borderColor: LEGACY_COLORS.border }}
  />

  {/* 내부 배경이 둥근 모서리 밖으로 비치는 것을 차단 */}
  <CornerMasks />
</div>
```

`CornerMasks`는 위 5절의 네 모서리 마스크 JSX를 뜻한다. 단일 사용처라면 별도 컴포넌트로 추출하지 않고 해당 위치에 직접 두는 편이 단순하다.

## 7. 유지해야 하는 동작

- sticky 헤더는 반드시 실제 `viewport`의 자손으로 유지한다.
- `ref`, `onScroll`, 무한 스크롤 감지, 스크롤 위치 복원 속성은 `viewport`에 둔다.
- 가로·세로 혼합 스크롤이면 `overflow-x-auto`를 제거하지 않는다.
- 표의 `colgroup`, `table-layout`, 열 너비, 행 높이, 버튼 너비는 수정하지 않는다.
- 하단 버튼이나 다음 단계 영역은 shell 밖의 기존 위치를 유지한다.
- 모바일에서 기존 내부 스크롤을 유지하려면 음수 right 값에만 `lg:`를 붙인다.

## 8. 자주 생기는 실패와 해결

### 스크롤바와 함께 우측 테두리도 밖으로 이동함

원인: border가 viewport 또는 긴 content에 남아 있다.

해결: viewport/content의 border를 제거하고 `absolute inset-0` 프레임에만 border를 둔다.

### 스크롤 중 하단이 각져 보임

원인: radius가 `min-h-full` 콘텐츠의 실제 맨 끝에 붙어 있다.

해결: radius를 긴 콘텐츠에서 제거하고 viewport 크기의 고정 프레임과 하단 corner mask로 표시한다.

### sticky 헤더가 고정되지 않음

원인: sticky 헤더가 실제 overflow 요소 밖으로 이동했거나 중간 wrapper가 새로운 스크롤 컨테이너가 됐다.

해결: sticky 헤더와 표는 실제 viewport 안에 두고 중간 content wrapper에는 overflow를 추가하지 않는다.

### 스크롤바가 생길 때 열 너비가 바뀜

원인: scrollbar gutter가 예약되지 않았다.

해결: viewport에 `scrollbar-gutter: stable`을 적용한다.

### 우측 버튼이나 마지막 열이 잘림

원인: viewport만 넓히고 gutter를 예약하지 않았거나 content 폭을 별도로 줄였다.

해결: viewport는 오른쪽으로 확장하고 `scrollbar-gutter: stable`을 사용한다. 표와 content의 기존 폭 계산은 수정하지 않는다.

### 모서리 마스크 색이 주변과 다름

원인: 마스크가 실제 shell 배경과 다른 토큰을 사용한다.

해결: DevTools에서 shell의 최종 배경 토큰을 확인한 뒤 같은 `var(--c-*)` 토큰을 마스크에 사용한다.

## 9. 브라우저 검증 체크리스트

다음 상태를 모두 확인해야 한다.

- 상단: 헤더가 기존처럼 고정되고 좌우 상단 모서리가 둥글다.
- 중간: 행과 열 너비가 바뀌지 않고 스크롤바만 표면 밖에 있다.
- 하단: 맨 아래까지 내리지 않아도 현재 viewport의 좌우 하단 모서리가 항상 둥글다.
- 맨 아래: 마지막 행과 하단 테두리가 겹치거나 잘리지 않는다.
- 우측: 마지막 열, 알약, 버튼이 스크롤 레일에 가려지지 않는다.
- 상호작용: 행 클릭, 버튼 클릭, 드래그, 가로 스크롤이 기존과 같다.
- 반응형: 모바일에서는 기존 레이아웃과 스크롤 위치가 유지된다.

## 현재 적용 예시

- `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx`
- 입출고 요청 작성 3단계의 품목 선택 표
