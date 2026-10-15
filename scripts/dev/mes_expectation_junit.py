"""Decode runner JUnit with the standard XML parser; never infer PASS from text."""

import json
import sys
import xml.etree.ElementTree as ET


def parse_junit(source: str) -> list[dict[str, object]]:
    """Retain every testcase, including skip/failure and parameterized names."""
    root = ET.fromstring(source)
    if root.tag not in {"testsuites", "testsuite"}:
        raise ValueError("not a JUnit report")
    return [
        {
            "classname": node.get("classname", ""),
            "name": node.attrib["name"],
            "nodeid": next((prop.get("value") for prop in node.findall("./properties/property") if prop.get("name") == "mes_nodeid"), None),
            "status": "FAIL" if any(node.find(tag) is not None for tag in ("failure", "error", "skipped")) else "PASS",
        }
        for node in root.iter("testcase")
    ]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(parse_junit(sys.stdin.buffer.read().decode("utf-8")), ensure_ascii=False))
