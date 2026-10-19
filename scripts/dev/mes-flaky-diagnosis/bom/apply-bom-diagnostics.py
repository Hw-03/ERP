"""Prepare opt-in BOM boundary instrumentation in an archive source copy only."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
EXPECTED_HEAD = "782eb344ab0360db93ecc38821b355a2375b1980"
SOURCE = "frontend/app/mes/_components/DesktopShippingView.tsx"
SPEC = "frontend/tests/e2e/shipping-additional-expectations.spec.ts"
QUANTITY = "frontend/app/mes/_components/common/QuantityInput.tsx"
EXPECTED_TEXT_SHA256 = {
    SOURCE: "5ea1e62f06ce1b5e75e83d34f401c58891cdb040fa1bc6070c27517f0db31f3a",
    SPEC: "75df4a8c060fbfccd7c951b13449b6830b9d81fc8bf85b1972ad676ff99a8487",
    QUANTITY: "5c866e2b6dc2a484dfb793d7e095a6795edf432e2a4e7c056995d872aa64f329",
}
HELPER = '''type BomDiagnosticRecorder = {
  recordReact: (label: string, payload: Record<string, unknown>) => number;
};

function getBomDiagnosticRecorder(): BomDiagnosticRecorder | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __mesBomDiag?: BomDiagnosticRecorder }).__mesBomDiag;
}

function recordBomDiag(label: string, payload: Record<string, unknown>): number | null {
  return getBomDiagnosticRecorder()?.recordReact(label, payload) ?? null;
}

'''
STATE = '''  const [draftLines, rawSetDraftLines] = useState<DraftLine[]>([]);
  const bomDiagInstanceRef = useRef<object>({});
  function setDraftLines(source: string, action: SetStateAction<DraftLine[]>): void {
    const recorder = getBomDiagnosticRecorder();
    if (!recorder) {
      rawSetDraftLines(action);
      return;
    }
    const write = recorder.recordReact("draft:set:call", {
      source, lines: draftLines, step: requestWizardStep,
      instance: bomDiagInstanceRef.current,
      generation: requestDraftGenerationRef.current,
      functional: typeof action === "function",
    });
    rawSetDraftLines((previous) => {
      const next = typeof action === "function" ? action(previous) : action;
      recorder.recordReact("draft:set:apply", { source, write, previous, next, instance: bomDiagInstanceRef.current });
      return next;
    });
  }
  useLayoutEffect(() => {
    recordBomDiag("commit", {
      lines: draftLines, step: requestWizardStep,
      instance: bomDiagInstanceRef.current, reactVersion,
      generation: requestDraftGenerationRef.current,
    });
  });'''
SETTER_SITES = (
    "returnHome", "url:existing-request", "url:new-draft", "clearDraft",
    "loadRequestIntoDraft", "loadDefaultBom:empty", "loadDefaultBom:loaded",
    "updateDraftLine", "addDraftLine", "removeDraftLine",
)


def text_sha256(value: str) -> str:
    """Hash normalized text so archive LF and Windows CRLF share one identity."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def replace_once(value: str, old: str, new: str) -> str:
    """Refuse source drift instead of silently applying a partial observation patch."""
    if value.count(old) != 1:
        raise ValueError(f"expected one source anchor: {old[:90]!r}")
    return value.replace(old, new, 1)


def instrument_source(value: str) -> str:
    """Retain business expressions while labelling every original draft writer."""
    if value.count("setDraftLines(") != len(SETTER_SITES):
        raise ValueError("original draft setter inventory changed")
    pieces = value.split("setDraftLines(")
    value = pieces[0] + "".join(
        f'setDraftLines("{site}", ' + piece
        for site, piece in zip(SETTER_SITES, pieces[1:], strict=True)
    )
    value = replace_once(
        value,
        'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
        'import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction, version as reactVersion } from "react";',
    )
    value = replace_once(value, "export function DesktopShippingView(", HELPER + "export function DesktopShippingView(")
    value = replace_once(value, "  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);", STATE)
    value = replace_once(
        value,
        "  function updateDraftLine(key: string, patch: Partial<DraftLine>) {",
        '''  function updateDraftLine(key: string, patch: Partial<DraftLine>) {
    recordBomDiag("updateDraftLine:call", {
      key, patchQuantity: patch.quantity, patchIncluded: patch.included,
      step: requestWizardStep, generation: requestDraftGenerationRef.current,
    });''',
    )
    value = replace_once(
        value,
        'onChange={(event) => onUpdate(line.key, { quantity: toNumber(event.target.value) })}',
        '''onChange={(event) => {
                    recordBomDiag("onChange", {
                      key: line.key, child: line.child_item_id, target: event.currentTarget,
                      nativeEvent: event.nativeEvent, inputQuantity: event.target.value,
                      previousPropQuantity: line.quantity,
                    });
                    onUpdate(line.key, { quantity: toNumber(event.target.value) });
                  }}''',
    )
    return value


def owned_path(sourcecopy: Path, relative: str) -> Path:
    """Confine every read and write to the disposable copy, including parent links."""
    candidate = sourcecopy / relative
    if not candidate.resolve().is_relative_to(sourcecopy.resolve()):
        raise ValueError(f"source-copy path escaped root: {relative}")
    return candidate


def prepare(sourcecopy: Path, native_only: bool = False) -> tuple[dict[str, str], dict[str, object]]:
    """Validate immutable inputs; native-only leaves the product source out of writes."""
    if (sourcecopy / ".git").exists():
        raise ValueError("refusing a Git checkout; use a dedicated git-archive source copy")
    originals = {}
    for relative, expected in EXPECTED_TEXT_SHA256.items():
        value = owned_path(sourcecopy, relative).read_text(encoding="utf-8")
        if text_sha256(value) != expected:
            raise ValueError(f"unexpected source text hash: {relative}")
        originals[relative] = value
    source_before_sha256 = hashlib.sha256(owned_path(sourcecopy, SOURCE).read_bytes()).hexdigest()
    outputs = {
        SPEC: replace_once(originals[SPEC], 'from "./_common-expectations";', 'from "./_bom-diag-fixture";'),
        "frontend/tests/e2e/_bom-diag-fixture.ts": (HERE / "bom-diag-fixture.ts").read_text(encoding="utf-8"),
        "frontend/tests/e2e/_bom-diag-native.js": (HERE / "bom-diag-native.js").read_text(encoding="utf-8"),
    }
    if not native_only:
        outputs[SOURCE] = instrument_source(originals[SOURCE])
    for relative in outputs:
        owned_path(sourcecopy, relative)
    for relative in outputs.keys() - originals.keys():
        if owned_path(sourcecopy, relative).exists():
            raise ValueError(f"refusing to replace existing helper: {relative}")
    diff = "".join(difflib.unified_diff(
        originals[SOURCE].splitlines(keepends=True), outputs.get(SOURCE, originals[SOURCE]).splitlines(keepends=True),
        fromfile="a/" + SOURCE, tofile="b/" + SOURCE,
    ))
    report = {
        "basis_head": EXPECTED_HEAD,
        "sourcecopy": str(sourcecopy),
        "default_enabled": False,
        "react_source_instrumented": not native_only,
        "react_source_before_sha256": source_before_sha256,
        "setter_sites": [] if native_only else list(SETTER_SITES),
        "original_test_body_changed": False,
        "output_text_sha256": {name: text_sha256(value) for name, value in outputs.items()},
        "source_diff": diff,
    }
    return outputs, report


def main() -> None:
    """Default to a read-only plan; --apply writes only validated source-copy files."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sourcecopy", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--native-only", action="store_true", help="retain native observer without modifying React product source")
    args = parser.parse_args()
    sourcecopy = args.sourcecopy.resolve(strict=True)
    outputs, report = prepare(sourcecopy, native_only=args.native_only)
    if args.apply:
        for relative, value in outputs.items():
            with owned_path(sourcecopy, relative).open("w", encoding="utf-8", newline="\n") as handle:
                handle.write(value)
    source_after_sha256 = hashlib.sha256(owned_path(sourcecopy, SOURCE).read_bytes()).hexdigest()
    report["react_source_after_sha256"] = source_after_sha256
    report["react_source_unchanged"] = source_after_sha256 == report["react_source_before_sha256"]
    if args.native_only and not report["react_source_unchanged"]:
        raise ValueError("native-only mode changed React product source bytes")
    report["applied"] = args.apply
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
