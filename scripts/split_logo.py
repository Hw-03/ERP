#!/usr/bin/env python3
"""DECOWIN 로고 이미지를 개체별로 분할하는 스크립트."""

from PIL import Image
import numpy as np
import os
import sys
from scipy.signal import argrelmin


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
                cx1 = max(0, bds[k] - PAD)
                cx2 = min(trimmed.shape[1], bds[k+1] + PAD)
                char_arr = trimmed[:, cx1:cx2, :]
                # 빈 섹션 건너뛰기
                if dark_counts(char_arr, 100).max() == 0:
                    continue
                letter = letters[char_idx] if char_idx < len(letters) else f'char{char_idx+1}'
                out_path = os.path.join(output_dir, f'letter_{letter}.png')
                Image.fromarray(char_arr).save(out_path)
                print(f"  저장: {out_path}  ({char_arr.shape[1]}x{char_arr.shape[0]}px)")
                char_idx += 1
        else:
            out_path = os.path.join(output_dir, f'{name}.png')
            Image.fromarray(sec).save(out_path)
            print(f"저장: {out_path}  ({sec.shape[1]}x{sec.shape[0]}px)")

    print(f"\n완료! 저장 위치: {os.path.abspath(output_dir)}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python split_logo.py <이미지경로> [출력폴더]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'split_logos'
    split_logo(input_path, output_dir)
