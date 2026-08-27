from app.services.inv_effect import StockTotals, summarize_stock_cells


def test_summarize_stock_cells_counts_warehouse_and_only_normal_departments() -> None:
    cells = {
        ("warehouse", None, None): 7,
        ("location", "조립", "PRODUCTION"): 3,
        ("location", "가공", "PRODUCTION"): 5,
        ("location", "조립", "DEFECTIVE"): 11,
        ("warehouse_box", "box-1", None): 2,
    }

    assert summarize_stock_cells(cells) == StockTotals(warehouse=7, department=8)


def test_summarize_stock_cells_preserves_explicit_zero_totals() -> None:
    assert summarize_stock_cells({}) == StockTotals(warehouse=0, department=0)
