#!/usr/bin/env python3
"""Extract PDF annotations and the text selected by text-markup annotations.

Designed for PDFs annotated in Microsoft Edge, but uses standard PDF annotations
and therefore also works with annotations from other readers.

Usage:
    python parse_pdf_annotations.py input.pdf -o annotations.json
    python parse_pdf_annotations.py input.pdf --pretty

Requires: PyMuPDF (pip install PyMuPDF)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import mimetypes
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz  # PyMuPDF compatibility name
    except ImportError:
        raise SystemExit("Missing dependency: install with `python3 -m pip install PyMuPDF`")


TEXT_MARKUP = {"Highlight", "Underline", "StrikeOut", "Squiggly"}


def json_value(value: Any) -> Any:
    """Convert PyMuPDF values into JSON-safe values without losing information."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [json_value(x) for x in value]
    if isinstance(value, dict):
        return {str(k): json_value(v) for k, v in value.items()}
    if hasattr(value, "x0") and hasattr(value, "y0"):
        return {k: float(getattr(value, k)) for k in ("x0", "y0", "x1", "y1")}
    return str(value)


def rect_from_quad(quad: Iterable[float]) -> tuple[float, float, float, float]:
    values = list(quad)
    return min(values[0::2]), min(values[1::2]), max(values[0::2]), max(values[1::2])


def quad_rects(vertices: Any) -> list[tuple[float, float, float, float]]:
    if not vertices:
        return []
    values: list[float] = []
    for point in vertices:
        if hasattr(point, "x"):
            values.extend((float(point.x), float(point.y)))
        elif isinstance(point, (list, tuple)):
            values.extend((float(point[0]), float(point[1])))
    return [rect_from_quad(values[i : i + 8]) for i in range(0, len(values) - 7, 8)]


def overlap_ratio(word: tuple[float, float, float, float], target: tuple[float, float, float, float]) -> float:
    x0, y0, x1, y1 = word
    a0, b0, a1, b1 = target
    area = max(0.0, min(x1, a1) - max(x0, a0)) * max(0.0, min(y1, b1) - max(y0, b0))
    word_area = max(1e-9, (x1 - x0) * (y1 - y0))
    return area / word_area


def selected_text(page: Any, annotation: Any) -> dict[str, Any]:
    """Recover selected words using QuadPoints, with Rect as a fallback.

    PDF annotations store the geometry, not necessarily the selected source text.
    PyMuPDF returns page text in the same top-left coordinate convention used here.
    """
    info: dict[str, Any] = {"text": "", "words": [], "method": "none", "confidence": 0.0}
    if annotation.type[1] not in TEXT_MARKUP:
        return info

    targets = quad_rects(getattr(annotation, "vertices", None))
    if not targets:
        rect = annotation.rect
        targets = [(rect.x0, rect.y0, rect.x1, rect.y1)]
        info["method"] = "annotation_rect"
    else:
        info["method"] = "quadpoints"

    words = page.get_text("words", sort=True)
    chosen: list[tuple[float, float, float, float, str, int, int, int, float]] = []
    for word in words:
        x0, y0, x1, y1, text, block, line, word_no = word[:8]
        ratios = [overlap_ratio((x0, y0, x1, y1), target) for target in targets]
        best = max(ratios, default=0.0)
        # A small tolerance handles glyph boxes that touch a PDF highlight edge.
        if best >= 0.15 or (best > 0 and any(
            x0 < tx1 and x1 > tx0 and y0 < ty1 and y1 > ty0 for tx0, ty0, tx1, ty1 in targets
        )):
            chosen.append((x0, y0, x1, y1, text, block, line, word_no, best))

    # Deduplicate words selected by adjacent quads, then preserve page reading order.
    dedup: dict[tuple[int, int, int], tuple[Any, ...]] = {}
    for word in chosen:
        dedup[(int(word[5]), int(word[6]), int(word[7]))] = word
    chosen = sorted(dedup.values(), key=lambda w: (w[5], w[6], w[0], w[7]))

    lines: list[list[tuple[Any, ...]]] = []
    for word in chosen:
        if not lines or (word[5], word[6]) != (lines[-1][0][5], lines[-1][0][6]):
            lines.append([word])
        else:
            lines[-1].append(word)
    text = "\n".join(" ".join(w[4] for w in line) for line in lines)
    info.update({
        "text": text,
        "words": [
            {"text": w[4], "bbox": [w[0], w[1], w[2], w[3]], "block": w[5], "line": w[6], "word": w[7], "overlap": round(w[8], 4)}
            for w in chosen
        ],
        "confidence": round(sum(w[8] for w in chosen) / len(chosen), 4) if chosen else 0.0,
    })
    return info


def pdf_date(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)
    match = re.match(r"D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+-Z])?(\d{2})?'?(\d{2})?'?", text)
    if not match:
        return text
    y, mo, day, hour, minute, second, zone, zh, zm = match.groups()
    result = f"{y}-{mo}-{day}"
    if hour:
        result += f"T{hour}:{minute or '00'}:{second or '00'}"
    if zone == "Z":
        result += "Z"
    elif zone in ("+", "-") and zh:
        result += f"{zone}{zh}:{zm or '00'}"
    return result


def annotation_record(page: Any, annotation: Any, page_number: int) -> dict[str, Any]:
    annotation_type = annotation.type[1]
    file_spec = None
    if annotation_type == "FileAttachment":
        try:
            file_spec = annotation.file_info
        except (AttributeError, TypeError):
            file_spec = None
    record: dict[str, Any] = {
        "page": page_number,
        "xref": getattr(annotation, "xref", None),
        "type": annotation_type,
        "type_code": annotation.type[0],
        "rect": list(annotation.rect),
        "vertices": json_value(getattr(annotation, "vertices", None)),
        "info": json_value(annotation.info),
        "colors": json_value(annotation.colors),
        "opacity": annotation.opacity,
        "flags": annotation.flags,
        "is_open": annotation.is_open,
        "file_spec": json_value(file_spec),
    }
    for key in ("creationDate", "modDate"):
        if key in record["info"]:
            record["info"][key + "_iso"] = pdf_date(record["info"][key])
    record["selected_text"] = selected_text(page, annotation)
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("-o", "--output", type=Path, help="JSON output path; stdout if omitted")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    parser.add_argument("--include-page-text", action="store_true", help="Include full extracted text for every page")
    args = parser.parse_args()

    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file():
        parser.error(f"PDF not found: {pdf_path}")

    stat = pdf_path.stat()
    document = fitz.open(pdf_path)
    metadata = json_value(document.metadata)
    pages: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []

    for page_number, page in enumerate(document, start=1):
        page_record = {
            "page": page_number,
            "label": page.get_label() if hasattr(page, "get_label") else None,
            "size_points": [float(page.rect.width), float(page.rect.height)],
            "rotation": page.rotation,
            "annotation_count": 0,
        }
        if args.include_page_text:
            page_record["text"] = page.get_text("text")
        page_annotations = list(page.annots() or [])
        page_record["annotation_count"] = len(page_annotations)
        pages.append(page_record)
        annotations.extend(annotation_record(page, annot, page_number) for annot in page_annotations)

    result = {
        "schema_version": "1.0",
        "tool": "parse_pdf_annotations.py",
        "input": {
            "path": str(pdf_path),
            "name": pdf_path.name,
            "mime_type": mimetypes.guess_type(pdf_path.name)[0],
            "size_bytes": stat.st_size,
            "mtime": dt.datetime.fromtimestamp(stat.st_mtime, dt.timezone.utc).isoformat(),
            "ctime": dt.datetime.fromtimestamp(stat.st_ctime, dt.timezone.utc).isoformat(),
        },
        "pdf": {
            "page_count": len(document),
            "metadata": metadata,
            "metadata_dates_iso": {key: pdf_date(value) for key, value in metadata.items() if key.lower().endswith("date")},
            "is_encrypted": document.is_encrypted,
            "needs_pass": document.needs_pass,
            "permissions": document.permissions,
            "has_toc": bool(document.get_toc()),
        },
        "pages": pages,
        "annotation_count": len(annotations),
        "annotations": annotations,
        "notes": [
            "selected_text is reconstructed from annotation geometry and page word boxes; PDF annotations may not store the source text.",
            "confidence is the mean selected-word intersection ratio, not a semantic confidence score.",
        ],
    }
    document.close()
    output = json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
