# -*- coding: utf-8 -*-
"""Lampiran N=60 entry point.

Kept as a stable command for CI and documentation. It builds the same canonical
merged document as `generate_validation_sheet.py`: the N=60 table is Section 8
of the document, and the Lampiran file is a byte-identical copy of the canonical
Lembar Validasi Internal.

Outputs (all in Final-Gemastik/):
  - Lembar_Validasi_Internal_PreHub.docx / .pdf
  - Lampiran_N60_PreHub.docx / .pdf  (byte-identical copies)
  - validation_doc_manifest.json

Run:  python scripts/generate_n60_appendix.py
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
