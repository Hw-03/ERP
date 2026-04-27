---
type: code-note
project: ERP
layer: scripts
source_path: scripts/dev/split_logo.py
status: active
updated: 2026-04-27
source_sha: c3805445477c
tags:
  - erp
  - scripts
  - dev-script
  - py
---

# split_logo.py

> [!summary] 역할
> 개발 중 데이터 생성, 점검, 로컬 진단을 돕는 보조 스크립트다.

## 원본 위치

- Source: `scripts/dev/split_logo.py`
- Layer: `scripts`
- Kind: `dev-script`
- Size: `6583` bytes

## 연결

- Parent hub: [[scripts/dev/dev|scripts/dev]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

````python
#!/usr/bin/env python3
"""DECOWIN 로고 이미지를 개체별로 분할하는 스크립트."""

from PIL import Image
import numpy as np
import os
import sys
from scipy.signal import argrelmin
from scipy.ndimage import label


def dark_counts(arr, threshold=100):
    return np.array([(arr[:, x, :3] < threshold).any(axis=1).sum()
                     for x in range(arr.shape[1])], dtype=float)


def trim_white_edges(arr, threshold=100):
    """어두운 픽셀이 없는 좌우 여백 열을 잘라낸다."""
    dc = dark_counts(arr, threshold)
    nonzero = np.where(dc > 0)[0]
    if not len(nonzero):
        return arr, 0
    return arr[:, nonzero[0]:nonzero[-1]+1, :], int(nonzero[0])


def find_dividers(counts, window=4, min_threshold=6):
    """0-픽셀 갭 및 로컬 최솟값을 합쳐서 글자 분리점 반환."""
    dividers = []

    # 완전 0인 연속 구간 중앙
    in_gap = False
    gs = 0
    for i, v in enumerate(counts):
        if v == 0:
            if not in_gap:
                in_gap = True
                gs = i
        else:
            if in_gap:
                in_gap = False
                dividers.append((gs + i) // 2)

    # 로컬 최솟값 (좁은 갭, 값이 낮은 경우)
    lmins = argrelmin(counts, order=window)[0]
    for i in lmins:
        if counts[i] <= min_threshold:
            dividers.append(int(i))

    # 정렬 후 5px 이내 중복 제거
    dividers = sorted(set(dividers))
    filtered = []
    prev = -999
    for d in dividers:
        if d - prev >= 5:
            filtered.append(d)
            prev = d

    return filtered


def make_transparent(rgb_arr):
    """흰 배경을 알파 0으로 변환. min(R,G,B)가 낮을수록 불투명."""
    min_ch = rgb_arr[:, :, :3].min(axis=2).astype(float)
    alpha = np.clip(255 * (240 - min_ch) / 90, 0, 255).astype(np.uint8)
    return np.dstack([rgb_arr[:, :, :3], alpha])


def tight_crop(rgba_arr, margin=2):
    """완전히 투명한 행/열을 잘라내고, margin px 여유만 남긴다."""
    alpha = rgba_arr[:, :, 3]
    cols = np.where(alpha.any(axis=0))[0]
    rows = np.where(alpha.any(axis=1))[0]
    if not len(cols) or not len(rows):
        return rgba_arr
    c1 = max(0, cols[0] - margin)
    c2 = min(rgba_arr.shape[1], cols[-1] + margin + 1)
    r1 = max(0, rows[0] - margin)
    r2 = min(rgba_arr.shape[0], rows[-1] + margin + 1)
    return rgba_arr[r1:r2, c1:c2]


def pad_transparent(rgba_arr, pad=4):
    """오브젝트 주변에 투명 여백을 추가한다 (옆 글자 픽셀 침범 없이)."""
    h, w = rgba_arr.shape[:2]
    out = np.zeros((h + 2 * pad, w + 2 * pad, 4), dtype=np.uint8)
    out[pad:pad + h, pad:pad + w] = rgba_arr
    return out


def keep_largest_blob(rgba_arr):
    """알파>0 픽셀 중 가장 큰 연결 덩어리만 남기고 나머지를 투명화."""
    mask = rgba_arr[:, :, 3] > 0
    labeled, num = label(mask)
    if num <= 1:
        return rgba_arr
    sizes = [(labeled == i).sum() for i in range(1, num + 1)]
    largest = sizes.index(max(sizes)) + 1
    out = rgba_arr.copy()
    out[labeled != largest, 3] = 0
    return out


def split_logo(input_path, output_dir='split_logos'):
    os.makedirs(output_dir, exist_ok=True)

    img = Image.open(input_path).convert('RGB')
    arr = np.array(img)
    height, width = arr.shape[:2]

    # 상하 여백 제거
    row_dark = (arr[:, :, :3] < 150).any(axis=(1, 2))
    rows = np.where(row_dark)[0]
    top = max(0, rows[0] - 4)
    bottom = min(height, rows[-1] + 5)
    content = arr[top:bottom, :, :]

    # ── 메인 4섹션 분리 (넓은 흰 구간 = 셀 구분선) ────────
    mc = dark_counts(content, threshold=150)
    in_gap = False
    gs = 0
    wide_gaps = []
    for i, v in enumerate(mc):
        if v == 0:
            if not in_gap:
                in_gap = True
                gs = i
        else:
            if in_gap:
                in_gap = False
                if i - gs >= 30:
                    wide_gaps.append((gs + i) // 2)

    print(f"메인 섹션 구분점: {wide_gaps}")
    w = content.shape[1]
    bounds = [0] + wide_gaps + [w]
    PAD = 6

    section_names = ['logo_D', 'text_DECOWIN', 'diamond', 'registered']
    letters = 'DECOWIN'

    for idx in range(len(bounds) - 1):
        x1 = max(0, bounds[idx] - PAD)
        x2 = min(w, bounds[idx + 1] + PAD)
        name = section_names[idx] if idx < len(section_names) else f'section_{idx+1}'
        sec = content[:, x1:x2, :]

        if 'text' in name:
            # 흰 여백 제거 후 글자 분리
            trimmed, offset = trim_white_edges(sec, threshold=80)
            tc = dark_counts(trimmed, threshold=100)
            divs = find_dividers(tc, window=4, min_threshold=6)
            print(f"글자 분리점: {divs}  -> {len(divs)+1}글자")

            bds = [0] + divs + [trimmed.shape[1]]
            char_idx = 0
            for k in range(len(bds) - 1):
                # 글자 경계는 PAD 없이 divider 기준으로만 자름 (옆 글자 픽셀 방지)
                cx1 = bds[k]
                cx2 = bds[k+1]
                char_arr = trimmed[:, cx1:cx2, :]
                # 빈 섹션 건너뛰기
                if dark_counts(char_arr, 100).max() == 0:
                    continue
                letter = letters[char_idx] if char_idx < len(letters) else f'char{char_idx+1}'
                out_path = os.path.join(output_dir, f'letter_{letter}.png')
                rgba = pad_transparent(tight_crop(keep_largest_blob(make_transparent(char_arr)), margin=0))
                Image.fromarray(rgba).save(out_path)
                print(f"  저장: {out_path}  ({rgba.shape[1]}x{rgba.shape[0]}px)")
                char_idx += 1
        else:
            out_path = os.path.join(output_dir, f'{name}.png')
            rgba = pad_transparent(tight_crop(keep_largest_blob(make_transparent(sec)), margin=0))
            Image.fromarray(rgba).save(out_path)
            print(f"저장: {out_path}  ({rgba.shape[1]}x{rgba.shape[0]}px)")

    print(f"\n완료! 저장 위치: {os.path.abspath(output_dir)}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python split_logo.py <이미지경로> [출력폴더]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'split_logos'
    split_logo(input_path, output_dir)
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
