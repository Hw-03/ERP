---
type: dashboard
project: ERP
status: draft
cssclasses:
  - erp-dashboard
tags:
  - erp
  - dashboard
aliases:
  - 
---

# {{title}}

> [!summary] 역할
> 특정 영역을 한눈에 보기 위한 대시보드.

## Quick Launch

| 목적 | 바로가기 |
|---|---|
|  |  |

## Active Notes

```dataview
TABLE layer AS "Layer", type AS "Type", source_path AS "Source"
FROM ""
WHERE project = "ERP" AND status = "active"
SORT file.name ASC
```

## Open Work

```dataview
TASK
FROM ""
WHERE !completed AND contains(tags, "erp")
SORT file.name ASC
```

Up: [[_templates]]
