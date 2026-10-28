# -*- coding: utf-8 -*-
"""Canonical entry point for the merged PreHub validation document.

The legacy two-page sheet has been superseded by a single exhaustive document
built from the live evaluation artifacts. This script and
`generate_n60_appendix.py` both delegate to `generate_merged_validation_doc.py`
so the canonical file and the Lampiran N=60 copy never drift.

Outputs (all in Final-Gemastik/):
  - Lembar_Validasi_Internal_PreHub.docx
  - Lampiran_N60_PreHub.docx   (byte-identical copy)
  - Lembar_Validasi_Internal_PreHub.pdf
  - Lampiran_N60_PreHub.pdf    (byte-identical copy)
  - validation_doc_manifest.json

Run:  python scripts/generate_validation_sheet.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_merged_validation_doc import build_documents  # noqa: E402


def main() -> None:
    build_documents()


if __name__ == "__main__":
    main()
