---
type: file-explanation
source_path: "_attic/scripts/dev/split_logo.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# split_logo.py — split_logo.py 설명

## 이 파일은 무엇을 책임지나

`split_logo.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `dark_counts`
- `trim_white_edges`
- `find_dividers`
- `make_transparent`
- `tight_crop`
- `pad_transparent`
- `keep_largest_blob`
- `split_logo`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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
```
