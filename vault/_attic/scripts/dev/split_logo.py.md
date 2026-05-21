---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/split_logo.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# split_logo.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/split_logo.py]]

## 원본 첫 줄 (또는 메타)

```
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


```
