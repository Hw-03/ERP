from pathlib import Path

from scripts import build_bom_graph_html, safety_stock_preview


def test_bom_graph_report_defaults_to_runtime_reports() -> None:
    project_root = Path(__file__).resolve().parents[3]

    assert Path(build_bom_graph_html.OUT_PATH) == (
        project_root / "_attic" / "runtime" / "reports" / "backend" / "bom_family_graph.html"
    )


def test_safety_stock_report_defaults_to_runtime_reports() -> None:
    project_root = Path(__file__).resolve().parents[3]

    assert Path(safety_stock_preview.OUT_PATH) == (
        project_root / "_attic" / "runtime" / "reports" / "backend" / "safety_stock_preview.html"
    )
