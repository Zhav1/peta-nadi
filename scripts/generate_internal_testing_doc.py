# -*- coding: utf-8 -*-
"""
Generate Dokumen Pengujian Internal Ketergunaan PreHub (DOCX).

The document deliberately separates:
  - real evidence already available (practitioner validation letters, test logs),
  - a ready-to-run internal usability protocol,
  - a clearly labelled simulation used only to demonstrate the table format.

Output: Final-Gemastik/Dokumen_Pengujian_Internal_PreHub.docx
"""

from __future__ import annotations

import os
import statistics
from datetime import date

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OUT = os.path.join("Final-Gemastik", "Dokumen_Pengujian_Internal_PreHub.docx")

NAVY = "1F3864"
TEAL = "2E7D6E"
LIGHT_BLUE = "EAF1F8"
LIGHT_GRAY = "F2F2F2"
LIGHT_TEAL = "E2F0EC"
AMBER = "FFF2CC"
RED = "F8D7DA"
GREEN = "E2EFDA"
WHITE = "FFFFFF"
MID_GRAY = "595959"
BORDER_GRAY = "BFBFBF"

FONT = "Calibri"
FONT_SIZE = 10.5


# ---------------------------------------------------------------------------
# Low-level OOXML helpers
# ---------------------------------------------------------------------------

def _rgb(hex_color: str) -> RGBColor:
    return RGBColor.from_string(hex_color)


def set_cell_background(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    # remove existing shading
    for old in tc_pr.findall(qn("w:shd")):
        tc_pr.remove(old)
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def set_cell_margins(cell, top=60, left=90, bottom=60, right=90) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for side, width in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(width))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tc_pr.append(mar)


def set_table_borders(table, color: str = BORDER_GRAY, size: str = "4") -> None:
    tbl_pr = table._tbl.tblPr
    for old in tbl_pr.findall(qn("w:tblBorders")):
        tbl_pr.remove(old)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), size)
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tbl_pr.append(borders)


def set_table_cell_margins(table, top=50, left=80, bottom=50, right=80) -> None:
    tbl_pr = table._tbl.tblPr
    for old in tbl_pr.findall(qn("w:tblCellMar")):
        tbl_pr.remove(old)
    mar = OxmlElement("w:tblCellMar")
    for side, width in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(width))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tbl_pr.append(mar)


def set_table_fixed_layout(table, widths_cm) -> None:
    tbl_pr = table._tbl.tblPr
    for old in tbl_pr.findall(qn("w:tblLayout")):
        tbl_pr.remove(old)
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tbl_pr.append(layout)
    for i, width in enumerate(widths_cm):
        table.columns[i].width = Cm(width)
    for row in table.rows:
        for i, width in enumerate(widths_cm):
            row.cells[i].width = Cm(width)


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_row_cant_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def set_row_height(row, height_cm: float, rule: str = "atLeast") -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tr_height = OxmlElement("w:trHeight")
    tr_height.set(qn("w:val"), str(int(height_cm * 567)))
    tr_height.set(qn("w:hRule"), rule)
    tr_pr.append(tr_height)


def keep_table_together(table) -> None:
    """Keep a table on one page by keeping every row but the last with the next."""
    rows = table.rows
    if len(rows) < 2:
        return
    for row in rows[:-1]:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.keep_with_next = True


def add_field(paragraph, field_code: str, placeholder: str = "1") -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = field_code
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = placeholder
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(separate)
    run._r.append(text)
    run._r.append(end)


def add_toc(paragraph) -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = 'TOC \\o "1-2" \\h \\z \\u'
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "Daftar isi akan dimuat setelah bidang diperbarui (Ctrl+A, lalu F9)."
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(separate)
    run._r.append(text)
    run._r.append(end)


# ---------------------------------------------------------------------------
# Document-level helpers
# ---------------------------------------------------------------------------

def setup_styles(doc: Document) -> None:
    styles = doc.styles

    normal = styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(FONT_SIZE)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    pf = normal.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(5)
    pf.line_spacing = 1.15

    for name, size, color, before, after in (
        ("Heading 1", 16, NAVY, 18, 8),
        ("Heading 2", 12.5, TEAL, 14, 5),
        ("Heading 3", 11, NAVY, 10, 4),
    ):
        style = styles[name]
        style.font.name = FONT
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = _rgb(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True
        style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    for name in ("List Bullet", "List Number"):
        style = styles[name]
        style.font.name = FONT
        style.font.size = Pt(FONT_SIZE)
        style.paragraph_format.space_after = Pt(3)

    # TOC styles may not exist until Word generates the field. If present,
    # compact them; otherwise Word COM applies the formatting after update.
    for name, size in (("toc 1", 9.5), ("toc 2", 9.0)):
        try:
            style = styles[name]
        except KeyError:
            continue
        style.font.name = FONT
        style.font.size = Pt(size)
        style.font.color.rgb = _rgb("000000")
        style.paragraph_format.space_before = Pt(0)
        style.paragraph_format.space_after = Pt(0)
        style.paragraph_format.line_spacing = 1.0


def setup_page(doc: Document) -> None:
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.3)
    section.right_margin = Cm(2.0)
    section.header_distance = Cm(1.1)
    section.footer_distance = Cm(1.0)
    section.different_first_page_header_footer = True

    # Replace the built-in center/right tab pair with a single right tab so
    # "GEMASTIK 2026" and the page number sit on the right margin.
    for style_name in ("Header", "Footer"):
        style = doc.styles[style_name]
        style.paragraph_format.tab_stops.clear_all()
        style.paragraph_format.tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT)

    # Header
    header = section.header
    hp = header.paragraphs[0]
    hp.text = ""
    r = hp.add_run("PreHub — Dokumen Pengujian Internal")
    r.font.size = Pt(8)
    r.font.color.rgb = _rgb(MID_GRAY)
    r = hp.add_run("\tGEMASTIK 2026")
    r.font.size = Pt(8)
    r.font.color.rgb = _rgb(MID_GRAY)
    p_pr = hp._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), BORDER_GRAY)
    p_bdr.append(bottom)
    p_pr.append(p_bdr)

    # Footer
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.text = ""
    r = fp.add_run("Internal — bukan dokumen publik")
    r.font.size = Pt(8)
    r.font.color.rgb = _rgb(MID_GRAY)
    r = fp.add_run("\tHalaman ")
    r.font.size = Pt(8)
    r.font.color.rgb = _rgb(MID_GRAY)
    add_field(fp, "PAGE")
    r = fp.add_run(" dari ")
    r.font.size = Pt(8)
    r.font.color.rgb = _rgb(MID_GRAY)
    add_field(fp, "NUMPAGES")


def add_para(doc, text: str, size: float = FONT_SIZE, bold: bool = False,
             italic: bool = False, color: str | None = None,
             align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after: float = 5,
             space_before: float = 0) -> None:
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(space_before)
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = _rgb(color)


def add_lead_para(doc, lead: str, text: str) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run(lead)
    r.bold = True
    r.font.size = Pt(FONT_SIZE)
    r = p.add_run(text)
    r.font.size = Pt(FONT_SIZE)


def add_caption(doc, text: str, source: str | None = None) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = _rgb(NAVY)
    if source:
        p2 = doc.add_paragraph()
        p2.paragraph_format.space_before = Pt(1)
        p2.paragraph_format.space_after = Pt(6)
        r2 = p2.add_run(source)
        r2.italic = True
        r2.font.size = Pt(7.5)
        r2.font.color.rgb = _rgb(MID_GRAY)


def add_table(doc, headers, rows, widths, font_size=8.8, header_fill=NAVY,
              zebra=True, center_cols=None, first_col_bold=False,
              row_height=None, status_col=None, status_colors=None,
              keep_together=False):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    set_table_cell_margins(table)

    header_row = table.rows[0]
    for i, header in enumerate(headers):
        cell = header_row.cells[i]
        cell.text = ""
        set_cell_background(cell, header_fill)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(str(header))
        r.bold = True
        r.font.size = Pt(font_size)
        r.font.color.rgb = _rgb(WHITE)
    set_repeat_table_header(header_row)
    set_row_cant_split(header_row)
    if row_height:
        set_row_height(header_row, row_height)

    for r_idx, row_values in enumerate(rows):
        row = table.add_row()
        set_row_cant_split(row)
        for c_idx, value in enumerate(row_values):
            cell = row.cells[c_idx]
            cell.text = ""
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            if center_cols and c_idx in center_cols:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(str(value))
            r.font.size = Pt(font_size)
            if first_col_bold and c_idx == 0:
                r.bold = True
            if zebra and r_idx % 2 == 1:
                set_cell_background(cell, LIGHT_GRAY)
            if status_col is not None and c_idx == status_col and status_colors:
                fill = status_colors.get(str(value).strip())
                if fill:
                    set_cell_background(cell, fill)
        if row_height:
            set_row_height(row, row_height)

    set_table_fixed_layout(table, widths)
    if keep_together:
        keep_table_together(table)
    return table


def add_callout(doc, title: str, body: str, fill: str = LIGHT_BLUE,
                border: str = NAVY, title_color: str = NAVY) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_row_cant_split(table.rows[0])
    cell = table.cell(0, 0)
    set_cell_background(cell, fill)
    set_cell_margins(cell, top=110, left=160, bottom=110, right=160)
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "18")
    left.set(qn("w:space"), "0")
    left.set(qn("w:color"), border)
    borders.append(left)
    tc_pr.append(borders)

    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(9.5)
    r.font.color.rgb = _rgb(title_color)

    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    p2.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r2 = p2.add_run(body)
    r2.font.size = Pt(9)
    set_table_fixed_layout(table, [16.7])


def add_bullets(doc, items, size=FONT_SIZE) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(item)
        r.font.size = Pt(size)


def add_page_break(doc) -> None:
    doc.add_page_break()


def add_chapter_heading(doc, text: str, level: int = 1):
    """Start a chapter on a new page without an empty page-break paragraph."""
    heading = doc.add_heading(text, level=level)
    heading.paragraph_format.page_break_before = True
    return heading


# ---------------------------------------------------------------------------
# DATA — real evidence
# ---------------------------------------------------------------------------

VALIDATION_ROWS = [
    ("1", "PT Multi Terminal Indonesia (Pelindo) — Logistik Regional 1 Medan",
     "21 Okt 2026", "Surat No. KS.01/23/10/1/UJLN/SSLM/MTI-26",
     "12 aspek evaluasi; 8 fitur",
     "3 fitur \"Sesuai\"; 5 fitur \"Cukup sesuai\"; dukungan pengembangan",
     "Tersedia"),
    ("2", "CV Bahana Mandiri",
     "17 Okt 2026", "Surat No. 1199/BM/X/2026",
     "8 aspek evaluasi; 6 fitur",
     "4 fitur pada kategori tertinggi (Sangat Sesuai/Sangat Bermanfaat); 2 fitur \"Sesuai\"",
     "Tersedia"),
    ("3", "PT Socfin Indonesia",
     "20 Okt 2026", "Surat tanggapan dan validasi praktisi",
     "9 aspek evaluasi; 7 fitur",
     "7 dari 7 fitur dinilai \"Sesuai\"; dukungan pengembangan",
     "Draft"),
    ("4", "PT Bumi Sawita Nusantara Berjaya",
     "2026", "Surat No. 001/BSN-EXT/X/2026",
     "9 aspek evaluasi; 6 fitur",
     "5 fitur \"Cukup sesuai\"; 1 fitur \"Sesuai sebagai prinsip\"",
     "Tersedia"),
    ("5", "Ditmawalumni Universitas Sumatera Utara",
     "23 Okt 2026", "Draft surat validasi institusional",
     "6 aspek evaluasi; 8 fitur",
     "Kolom penilaian fitur belum diisi; catatan kualitatif tersedia",
     "Draft"),
    ("6", "PT Rahmat Mandiri Sentosa",
     "1 Jun 2026", "Dokumentasi wawancara operasional logistik",
     "5 aspek kebutuhan operasional",
     "Validasi kebutuhan, bukan validasi produk; tidak ada rating fitur",
     "Tersedia"),
]

FEATURE_HEADERS = ["Tema fitur", "PT MTI", "CV Bahana", "PT Socfin", "Bumi Sawita", "USU"]
FEATURE_ROWS = [
    ("Dashboard pemantauan dan peringatan dini", "S", "SS", "S", "CS", "—"),
    ("Penyaringan dan validasi bukti multisumber", "S", "S", "S", "CS", "—"),
    ("Transparansi dan penelusuran bukti", "—", "SS", "—", "CS", "—"),
    ("Analisis dampak dan tingkat risiko", "CS", "S", "—", "CS", "—"),
    ("Rekomendasi dan simulasi rute mitigasi", "CS", "SS", "S", "CS", "—"),
    ("Kendali operator (HITL) dan pencatatan keputusan", "S", "SS", "S", "S", "—"),
    ("Integrasi data cuaca, lalu lintas, dan armada", "—", "—", "S", "—", "—"),
    ("Kesiapan implementasi dan ketahanan sistem", "—", "—", "S", "—", "—"),
]

FUNCTIONAL_ROWS = [
    ("1", "Backend unit dan integration test", "pytest",
     "354 tes (351 lulus, 3 gagal)", "Sebagian",
     "pytest-full.log (25 Okt 2026)"),
    ("2", "Frontend end-to-end test", "Playwright",
     "102 tes (93 lulus, 9 skip)", "Lulus",
     ".planning/milestones/M9/full-suite-after.txt (28 Okt 2026)"),
    ("3", "Benchmark konsensus", "60 skenario",
     "TP 35, FP 0, TN 25, FN 0; Brier 0,0937", "Lulus*",
     "backend/app/routers/evaluation_router.py; laporan"),
    ("4", "Black-box API", "15 kasus",
     "15/15 lulus (22 Okt 2026)", "Lulus",
     "Makalah-PreHub.docx, Tabel II"),
    ("5", "Matriks uji fungsional", "137 kasus FR-01–FR-20",
     "Terdokumentasi; evaluation_router menyebut 133 kasus", "Perlu selaras",
     "Laporan-PreHub-GEMASTIK19.docx; evaluation_router.py"),
    ("6", "Latensi solver rute CPU", "Unit benchmark",
     "1,85 ms (target < 150 ms)", "Tercatat",
     "scripts/generate_docx_technical_doc.py; log terkait"),
]

GAP_ROWS = [
    ("Skor SUS 85,5 (Grade A/Excellent)",
     "Tidak ada data mentah; laporan justru menyatakan uji SUS ditunda",
     "Belum", "Jalankan uji SUS n=10 dan lampirkan matriks Q1–Q10"),
    ("Waktu keputusan 14,8 → 1,8 menit",
     "Tidak ada timing log; belum ada uji within-subject",
     "Belum", "Jalankan skenario manual vs PreHub dengan timer dan rekaman"),
    ("7 dari 7 fitur \"Sesuai\"",
     "Surat PT Socfin Indonesia, 20 Oktober 2026",
     "Tersedia", "Kutip dengan atribusi mitra dan tanggal"),
    ("Semua mitra menilai semua fitur sesuai",
     "PT MTI: 3 Sesuai, 5 Cukup sesuai; Bumi Sawita: 5 Cukup sesuai, 1 Sesuai",
     "Tidak didukung", "Sajikan matriks per mitra, bukan generalisasi"),
    ("137 test case lulus 100%",
     "Log terakhir: 351 lulus, 3 gagal; 93 E2E lulus, 9 skip",
     "Sebagian", "Perbaiki 3 tes gagal atau nyatakan sebagai known issue"),
    ("Siap operasional / siap pilot",
     "Belum ada pilot dengan BULOG/Bapanas/operator armada",
     "Tidak didukung", "Sebut sebagai demonstrator decision-support"),
]

# ---------------------------------------------------------------------------
# DATA — internal test design
# ---------------------------------------------------------------------------

PARTICIPANT_ROWS = [
    ("R01", "Frontend Developer", "8 bulan"),
    ("R02", "Backend Developer", "7 bulan"),
    ("R03", "QA Engineer", "6 bulan"),
    ("R04", "UI/UX Designer", "8 bulan"),
    ("R05", "Product Analyst", "5 bulan"),
    ("R06", "Data Analyst", "4 bulan"),
    ("R07", "Mahasiswa Teknik Industri (domain logistik)", "2 bulan"),
    ("R08", "Mahasiswa Teknik Industri (domain logistik)", "2 bulan"),
    ("R09", "Koordinator operasional (role-play internal)", "3 bulan"),
    ("R10", "Project Lead", "9 bulan"),
]

SCENARIO_ROWS = [
    ("D1", "Identifikasi gangguan dan bukti",
     "Peta menampilkan alert banjir pada koridor Medan–Tebing Tinggi",
     "Peserta menyebut lokasi, sumber, waktu pembaruan, dan status bukti",
     "8 menit", "Waktu, completion, error"),
    ("D2", "Bandingkan mitigasi",
     "Modal rekomendasi menampilkan Continue, Reroute, Hold",
     "Peserta memilih satu opsi dan menyebut alasan berbasis bukti",
     "10 menit", "Waktu, pilihan, alasan, error"),
    ("D3", "Setujui atau tahan keputusan",
     "Panel approval dengan peran Dispatcher",
     "Peserta mengirim approval/HOLD dan keputusan tercatat",
     "5 menit", "Waktu, completion, error"),
]

AGENDA_ROWS = [
    ("0–5", "Pembukaan, informed consent, penjelasan tujuan"),
    ("5–10", "Latihan singkat dan pengenalan antarmuka"),
    ("10–30", "Kondisi A: tugas manual (baseline, 20 menit)"),
    ("30–35", "Istirahat dan pengisian kuesioner singkat"),
    ("35–50", "Kondisi B: tugas dengan PreHub (15 menit)"),
    ("50–57", "Pengisian SUS dan pertanyaan demografi"),
    ("57–60", "Wawancara singkat dan penutup"),
]

METRIC_ROWS = [
    ("Task completion rate", "Tugas selesai tanpa bantuan / total tugas × 100", "%", "≥ 90%", "Lembar tugas"),
    ("First-attempt success", "Tugas benar pada percobaan pertama / total tugas × 100", "%", "≥ 80%", "Lembar tugas"),
    ("Time on task", "Timestamp selesai − timestamp mulai", "menit", "Median dan mean", "Timer/rekaman"),
    ("Error rate", "Jumlah error / total tugas × 100", "%", "≤ 10%", "Log error"),
    ("SUS", "((Σ ganjil − 1) + (Σ genap 5 − x)) × 2,5", "0–100", "≥ 68 (above average)", "Kuesioner SUS"),
    ("Decision confidence", "Rating 1–5 setelah keputusan", "skor", "≥ 4", "Kuesioner singkat"),
    ("Qualitative themes", "Koding jawaban terbuka", "tema", "Tidak ada target angka", "Wawancara"),
]

GRADE_ROWS = [
    ("A+", "≥ 84,1", "Excellent / Best Imaginable (batas 85,5)", "85,5"),
    ("A", "80,8–84,0", "Excellent (72,6–85,5)", "—"),
    ("A−", "78,9–80,7", "Excellent", "—"),
    ("B+", "77,2–78,8", "Excellent", "—"),
    ("B", "74,1–77,1", "Excellent", "—"),
    ("B−", "72,6–74,0", "Excellent", "—"),
    ("C+", "71,1–72,5", "Good (51,7–72,6)", "—"),
    ("C", "65,0–71,0", "Good", "—"),
    ("C−", "62,7–64,9", "Good", "—"),
    ("D", "51,7–62,6", "OK (39,4–51,7)", "—"),
    ("F", "< 51,7", "Poor/Worst", "—"),
]

THREAT_ROWS = [
    ("Familiarity bias", "SUS dan waktu terlalu optimistis karena peserta mengenal produk",
     "Label \"internal\"; rekrut minimal 3 peserta di luar tim; laporkan komposisi"),
    ("Learning effect", "Kondisi kedua lebih cepat karena peserta sudah belajar",
     "Acak urutan kondisi (manual dulu / PreHub dulu) dan laporkan urutan"),
    ("Observer bias", "Penguji berbeda menilai error dan waktu secara berbeda",
     "Gunakan rubrik; dua penguji atau rekaman layar; kalibrasi sebelum sesi"),
    ("Small sample", "Rata-rata tidak stabil dan CI lebar",
     "Laporkan data per partisipan, median, IQR, dan CI; jangan hanya mean"),
    ("Task simplification", "Waktu 1,8 menit tidak realistis jika tugas terlalu mudah",
     "Gunakan skenario dengan pencarian bukti dan verifikasi, bukan klik tunggal"),
    ("Demand characteristics", "Peserta ingin menyenangkan tim",
     "Anonimkan ID; fasilitator tidak menilai; tegaskan tidak ada jawaban benar"),
]

SUS_ITEMS = [
    ("1", "Saya rasa saya akan sering menggunakan sistem ini.", "+"),
    ("2", "Saya merasa sistem ini terlalu rumit padahal tidak perlu.", "−"),
    ("3", "Saya merasa sistem ini mudah digunakan.", "+"),
    ("4", "Saya rasa saya akan membutuhkan bantuan teknisi untuk dapat menggunakan sistem ini.", "−"),
    ("5", "Saya merasa fitur-fitur dalam sistem ini berjalan dengan baik dan terintegrasi.", "+"),
    ("6", "Saya merasa terlalu banyak ketidakkonsistenan dalam sistem ini.", "−"),
    ("7", "Saya rasa orang lain akan cepat belajar menggunakan sistem ini.", "+"),
    ("8", "Saya merasa sistem ini sangat canggung untuk digunakan.", "−"),
    ("9", "Saya merasa sangat percaya diri saat menggunakan sistem ini.", "+"),
    ("10", "Saya perlu belajar banyak hal sebelum bisa menggunakan sistem ini.", "−"),
]

# ---------------------------------------------------------------------------
# DATA — simulation (clearly labelled)
# ---------------------------------------------------------------------------

SIM_IDS = [f"R{i:02d}" for i in range(1, 11)]
SIM_ROLES = [
    "Frontend Developer", "Backend Developer", "QA Engineer", "UI/UX Designer",
    "Product Analyst", "Data Analyst", "Mahasiswa Teknik Industri",
    "Mahasiswa Teknik Industri", "Koordinator operasional (role-play)", "Project Lead",
]
SIM_EXPERIENCE = ["8 bulan", "7 bulan", "6 bulan", "8 bulan", "5 bulan",
                  "4 bulan", "2 bulan", "2 bulan", "3 bulan", "9 bulan"]

SIM_SUS = [
    [5, 3, 5, 3, 5, 3, 3, 1, 5, 1],
    [3, 1, 4, 1, 5, 3, 5, 1, 3, 1],
    [5, 1, 3, 1, 3, 1, 5, 1, 5, 3],
    [5, 1, 5, 3, 3, 1, 5, 1, 5, 3],
    [5, 1, 5, 1, 5, 3, 5, 1, 3, 3],
    [5, 3, 5, 1, 5, 1, 3, 3, 5, 1],
    [5, 3, 5, 3, 5, 1, 4, 1, 5, 1],
    [5, 1, 3, 1, 3, 1, 5, 1, 5, 2],
    [5, 3, 5, 1, 5, 1, 5, 1, 3, 2],
    [5, 3, 5, 3, 5, 1, 5, 1, 5, 1],
]

SIM_MANUAL = [18.2, 16.5, 15.8, 15.1, 14.7, 14.2, 13.9, 13.6, 13.0, 13.0]
SIM_PREHUB = [2.4, 2.1, 2.0, 1.9, 1.8, 1.8, 1.7, 1.6, 1.4, 1.3]
SIM_ORDER = ["Manual → PreHub"] * 5 + ["PreHub → Manual"] * 5
SIM_MANUAL_CORRECT = ["Ya", "Ya", "Ya", "Tidak", "Ya", "Ya", "Ya", "Tidak", "Ya", "Ya"]
SIM_PREHUB_CORRECT = ["Ya", "Ya", "Ya", "Ya", "Ya", "Ya", "Ya", "Ya", "Tidak", "Ya"]


def sus_score(responses):
    points = sum((r - 1) if i % 2 == 0 else (5 - r) for i, r in enumerate(responses))
    return points, points * 2.5


def grade_sauro(score):
    if score >= 84.1:
        return "A+"
    if score >= 80.8:
        return "A"
    if score >= 78.9:
        return "A−"
    if score >= 77.2:
        return "B+"
    if score >= 74.1:
        return "B"
    if score >= 72.6:
        return "B−"
    if score >= 71.1:
        return "C+"
    if score >= 65.0:
        return "C"
    if score >= 62.7:
        return "C−"
    if score >= 51.7:
        return "D"
    return "F"


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------

def cover(doc: Document) -> None:
    # Top band
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    set_cell_background(cell, NAVY)
    set_cell_margins(cell, top=380, left=420, bottom=380, right=420)
    set_row_height(table.rows[0], 6.2, "atLeast")

    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(12)
    r = p.add_run("DOKUMEN INTERNAL  ·  GEMASTIK 2026")
    r.font.size = Pt(9)
    r.bold = True
    r.font.color.rgb = _rgb("D9E2F3")

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run("PENGUJIAN INTERNAL\nKETERGUNAAN PREHUB")
    r.font.size = Pt(28)
    r.bold = True
    r.font.color.rgb = _rgb(WHITE)

    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("Protokol, instrumen, dan rekapitulasi bukti uji")
    r.font.size = Pt(12)
    r.font.color.rgb = _rgb("D9E2F3")

    set_table_fixed_layout(table, [16.7])

    add_para(doc, "", space_after=12)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("PreHub")
    r.font.size = Pt(20)
    r.bold = True
    r.font.color.rgb = _rgb(TEAL)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(18)
    r = p.add_run("Sistem peringatan dini dan rekomendasi mitigasi gangguan distribusi pangan")
    r.font.size = Pt(11)
    r.italic = True
    r.font.color.rgb = _rgb(MID_GRAY)

    info_rows = [
        ("Nomor dokumen", "PREHUB/TEST/2026-01"),
        ("Versi", "1.0"),
        ("Tanggal", "28 Oktober 2026"),
        ("Build yang diuji", "__________________________ (isi commit hash)"),
        ("Penyusun", "Tim PreHub GEMASTIK 2026 — Universitas Sumatera Utara"),
        ("Status", "Protokol siap eksekusi; sebagian bukti tersedia"),
    ]
    add_table(doc, ["Item", "Keterangan"], info_rows, [4.2, 12.5],
              font_size=9.5, header_fill=TEAL, first_col_bold=True)

    add_para(doc, "", space_after=10)
    add_callout(
        doc,
        "PENTING — status data dalam dokumen ini",
        "Dokumen ini memisahkan tiga jenis bukti: (1) validasi praktisi/industri yang suratnya "
        "sudah tersedia; (2) pengujian fungsional yang log-nya tersedia; dan (3) uji ketergunaan "
        "internal yang protokolnya siap dijalankan. Data pada Bab 6 adalah SIMULASI FORMAT, bukan "
        "hasil pengukuran. Angka 85,5 dan 14,8 → 1,8 menit pada Bab 6 tidak boleh dikutip sebagai "
        "bukti sampai uji di Bab 3 dijalankan dan tabel simulasi diganti dengan data mentah.",
        fill=AMBER,
        border="BF8F00",
        title_color="7F6000",
    )


def status_page(doc: Document) -> None:
    add_chapter_heading(doc, "Lembar Status Bukti", level=1)
    add_para(doc, "Halaman ini menjawab satu pertanyaan: bukti apa yang benar-benar dimiliki tim "
                  "saat ini, dan bukti apa yang masih kosong. Gunakan tabel ini sebelum menulis "
                  "kalimat hasil di laporan.")

    add_caption(doc, "Tabel 0.1. Ringkasan status bukti")
    rows = [
        ("1", "Validasi praktisi/industri", "5 mitra + 1 wawancara", "Tersedia",
         "Surat di Final-Gemastik/"),
        ("2", "Uji fungsional backend", "354 tes pytest", "Sebagian",
         "pytest-full.log: 351 lulus, 3 gagal"),
        ("3", "Uji end-to-end frontend", "102 tes Playwright", "Tersedia",
         "full-suite-after.txt: 93 lulus, 9 skip"),
        ("4", "Benchmark konsensus", "60 skenario", "Tersedia*",
         "TP 35, FP 0, TN 25, FN 0; Brier 0,0937"),
        ("5", "Uji ketergunaan (SUS, waktu, error)", "Belum dijalankan", "Belum",
         "Protokol ada di Bab 3–5; data belum ada"),
        ("6", "Data mentah SUS per item", "Belum ada", "Belum",
         "Template ada di Tabel 5.2"),
        ("7", "Timing log keputusan", "Belum ada", "Belum",
         "Template ada di Tabel 5.5"),
    ]
    add_table(doc, ["No", "Jenis bukti", "Cakupan", "Status", "Sumber / catatan"],
              rows, [1.0, 4.2, 3.3, 2.0, 6.2], font_size=8.8,
              status_col=3,
              status_colors={"Tersedia": GREEN, "Tersedia*": GREEN,
                             "Sebagian": AMBER, "Belum": RED, "Draft": AMBER})

    add_para(doc, "", space_after=4)
    add_callout(
        doc,
        "Konsekuensi untuk laporan",
        "Kalimat \"SUS 85,5 (Grade A/Excellent) dan waktu keputusan turun dari 14,8 menjadi "
        "1,8 menit\" belum dapat dipertahankan sebagai hasil pengukuran. Yang bisa dipertahankan "
        "saat ini adalah: (a) validasi praktisi dari mitra yang suratnya tersedia; (b) hasil uji "
        "fungsional yang log-nya tersedia; dan (c) protokol uji ketergunaan internal yang siap "
        "dijalankan. Setelah uji dijalankan, angka pada Bab 6 diganti dengan data mentah dan "
        "baru boleh dikutip.",
        fill=LIGHT_BLUE,
    )

    add_para(doc, "", space_after=4)
    add_caption(doc, "Tabel 0.1. Ringkasan status bukti")
    add_para(doc, "Tanda * pada benchmark berarti hasil berlaku untuk 60 skenario uji, bukan untuk "
                  "operasi lapangan. Selisih TP 35 vs ekspektasi 34 masih terbuka dan perlu "
                  "diselesaikan sebelum angka dipakai sebagai klaim final.", size=9, italic=True,
             color=MID_GRAY)


def toc_page(doc: Document) -> None:
    add_chapter_heading(doc, "Daftar Isi", level=1)
    p = doc.add_paragraph()
    add_toc(p)


def bab1(doc: Document) -> None:
    heading = doc.add_heading("BAB 1  Pendahuluan", level=1)
    heading.paragraph_format.page_break_before = True
    doc.add_heading("1.1  Tujuan dokumen", level=2)
    add_para(doc, "Dokumen ini disusun untuk menjawab pertanyaan penguji: \"apa bukti dari uji "
                  "internal yang diklaim?\" Dokumen ini tidak menambah klaim baru. Tujuannya ada "
                  "empat:")
    add_bullets(doc, [
        "Menyediakan protokol uji ketergunaan internal yang dapat diulang oleh orang lain.",
        "Merekam bukti validasi praktisi yang sudah dimiliki tim, lengkap dengan sumbernya.",
        "Memisahkan bukti nyata dari simulasi format agar laporan tidak mencampur keduanya.",
        "Menjadi lampiran teknis yang bisa dipakai saat menulis Bab Evaluasi laporan.",
    ])

    doc.add_heading("1.2  Ruang lingkup", level=2)
    add_para(doc, "Objek uji adalah antarmuka PreHub pada alur pemantauan koridor, penelusuran "
                  "bukti, perbandingan mitigasi, dan persetujuan keputusan. Peserta adalah "
                  "anggota tim dan mahasiswa dengan latar domain logistik, bukan dispatcher "
                  "operasional perusahaan. Karena itu, hasilnya disebut uji internal formatif dan "
                  "tidak digeneralisasi ke pengguna operasional.")
    add_para(doc, "Lokasi uji: lingkungan lokal (localhost:3000) atau deployment Vercel yang "
                  "sama dengan build yang diuji. Setiap sesi berlangsung 60 menit. Build yang "
                  "diuji harus dicatat sebagai commit hash dan tanggal deploy.")

    doc.add_heading("1.3  Definisi istilah", level=2)
    def_rows = [
        ("Validasi praktisi", "Penilaian ahli/praktisi terhadap konsep dan prototipe. Instrumennya "
                              "bukan SUS; skalanya dapat berupa \"Sesuai\", \"Cukup sesuai\", dan "
                              "sejenisnya."),
        ("Uji ketergunaan", "Pengamatan pengguna saat menyelesaikan tugas dengan antarmuka. "
                            "Mengukur completion, waktu, error, dan persepsi (SUS)."),
        ("Uji fungsional", "Pengujian perangkat lunak terhadap kebutuhan fungsional (pytest, "
                           "Playwright, black-box API). Tidak mengukur pengalaman pengguna."),
        ("SUS", "System Usability Scale, 10 item, skor 0–100. Mengukur persepsi ketergunaan, "
                "bukan kecepatan atau akurasi keputusan."),
        ("Task completion", "Persentase tugas yang diselesaikan tanpa bantuan."),
        ("Time on task", "Durasi dari sinyal mulai sampai keputusan dikirim."),
        ("Error rate", "Persentase tugas dengan kesalahan yang memengaruhi hasil keputusan."),
        ("Simulasi", "Data contoh yang dibuat untuk memperlihatkan format tabel. Bukan data "
                     "pengukuran dan tidak boleh dikutip sebagai hasil."),
    ]
    add_table(doc, ["Istilah", "Definisi operasional"], def_rows, [4.0, 12.7],
              font_size=9, first_col_bold=True)

    doc.add_heading("1.4  Dasar dan batasan", level=2)
    add_para(doc, "Dokumen ini mengikuti status yang sudah tercatat di dalam proyek:")
    add_bullets(doc, [
        "Final-Gemastik/SPEC.md:60 (O-03): SUS, task-time, error-rate, dan baseline manual "
        "masih deferred.",
        "Final-Gemastik/last-judgement.txt:13: belum ada pengujian dispatcher dan belum ada "
        "data task completion, waktu keputusan, error, atau SUS.",
        "Bagian evaluasi Laporan-PreHub-GEMASTIK19.docx: pengujian pengguna (SUS, task "
        "completion, decision time, error rate, baseline manual) ditunda.",
    ])
    add_callout(
        doc,
        "Batasan yang tidak boleh dilanggar",
        "Surat validasi praktisi tidak dapat dikonversi menjadi skor SUS: konstruk, skala, dan "
        "respondennya berbeda.",
        fill=RED,
        border="C00000",
        title_color="C00000",
    )


def bab2(doc: Document) -> None:
    add_chapter_heading(doc, "BAB 2  Bukti yang Sudah Ada", level=1)
    doc.add_heading("2.1  Validasi praktisi dan industri", level=2)
    add_para(doc, "Tim sudah memiliki surat tanggapan dari lima mitra dan satu dokumentasi "
                  "wawancara. Dokumen-dokumen ini adalah bukti nyata, tetapi jenisnya adalah "
                  "validasi ahli/praktisi, bukan uji ketergunaan dengan pengguna akhir. Tabel 2.1 "
                  "merangkum isi dan statusnya.")
    add_caption(doc, "Tabel 2.1. Rekapitulasi validasi praktisi")
    add_table(doc, ["No", "Mitra", "Tanggal", "Dokumen", "Cakupan", "Hasil utama", "Status"],
              VALIDATION_ROWS, [0.8, 3.1, 1.7, 2.8, 2.5, 4.3, 1.5], font_size=7.8,
              status_col=6, status_colors={"Tersedia": GREEN, "Draft": AMBER})
    add_para(doc, "Sumber: berkas PDF/DOCX di Final-Gemastik/. Status \"Draft\" berarti surat "
                  "belum final atau kolom penilaian belum lengkap; jangan dikutip sebagai surat "
                  "final.", size=8, italic=True, color=MID_GRAY)

    doc.add_heading("2.2  Matriks penilaian fitur", level=2)
    add_para(doc, "Setiap mitra menilai daftar fitur yang tidak identik. Karena itu, tabel ini "
                  "bersifat deskriptif dan tidak dijumlahkan menjadi satu skor. Legenda: SS = "
                  "Sangat Sesuai/Sangat Bermanfaat; S = Sesuai/Sesuai & Inovatif/Sesuai sebagai "
                  "prinsip; CS = Cukup Sesuai; — = tidak dinilai dalam surat. USU = Ditmawalumni "
                  "Universitas Sumatera Utara.")
    add_caption(doc, "Tabel 2.2. Matriks penilaian fitur lintas mitra")
    add_table(doc, FEATURE_HEADERS, FEATURE_ROWS, [6.2, 2.1, 2.1, 2.1, 2.1, 2.1],
              font_size=8.5, center_cols={1, 2, 3, 4, 5}, first_col_bold=True)
    add_para(doc, "Catatan: PT Socfin menilai 7/7 fitur \"Sesuai\"; PT MTI menilai 3/8 \"Sesuai\" "
                  "dan 5/8 \"Cukup sesuai\"; CV Bahana menilai 4/6 fitur pada kategori tertinggi; "
                  "Bumi Sawita menilai 5/6 \"Cukup sesuai\" dan 1/6 \"Sesuai sebagai prinsip\". "
                  "Tidak ada dasar untuk menyatakan \"semua mitra menilai semua fitur sesuai\".",
             size=8.5, italic=True, color=MID_GRAY)

    doc.add_heading("2.3  Rekapitulasi pengujian fungsional", level=2)
    add_para(doc, "Bukti berikut berasal dari log dan kode, bukan dari persepsi pengguna. "
                  "Angka-angka ini boleh dikutip sebagai hasil pengujian fungsional, dengan "
                  "menyebut tanggal dan berkas lognya.")
    add_caption(doc, "Tabel 2.3. Rekapitulasi pengujian fungsional")
    add_table(doc, ["No", "Pengujian", "Instrumen", "Hasil", "Status", "Bukti"],
              FUNCTIONAL_ROWS, [0.8, 3.6, 2.6, 4.4, 1.8, 4.5], font_size=8,
              status_col=4, status_colors={"Lulus": GREEN, "Lulus*": GREEN,
                                            "Sebagian": AMBER, "Perlu selaras": AMBER,
                                            "Tercatat": LIGHT_BLUE})
    add_para(doc, "*Benchmark 60 skenario: TP 35, FP 0, TN 25, FN 0, Brier 0,0937. Angka ini "
                  "berlaku untuk dataset uji, bukan operasi lapangan. Selisih TP 35 vs ekspektasi "
                  "34 masih terbuka.", size=8, italic=True, color=MID_GRAY)

    doc.add_heading("2.4  Kesenjangan bukti", level=2)
    add_para(doc, "Tabel berikut adalah inti jawaban untuk penguji. Kolom \"Status\" menyatakan "
                  "apakah sebuah klaim sudah didukung, sebagian didukung, atau belum didukung.")
    add_caption(doc, "Tabel 2.4. Kesenjangan antara klaim dan bukti")
    add_table(doc, ["Klaim", "Bukti yang dimiliki", "Status", "Tindakan"],
              GAP_ROWS, [4.2, 5.8, 2.2, 4.5], font_size=8.2,
              status_col=2, status_colors={"Tersedia": GREEN, "Sebagian": AMBER,
                                            "Belum": RED, "Tidak didukung": RED})

    doc.add_heading("2.5  Ringkasan yang boleh dikutip", level=2)
    add_para(doc, "Sampai uji ketergunaan dijalankan, hanya tiga kalimat berikut yang dapat "
                  "dipertahankan tanpa risiko metodologis:")
    add_bullets(doc, [
        "Validasi praktisi: lima mitra menilai konsep dan prototipe; penilaiannya bervariasi "
        "dan tidak boleh digeneralisasi menjadi \"semua fitur sesuai\".",
        "Uji fungsional: 93 dari 102 tes E2E lulus (9 skip); 351 tes backend lulus dan 3 gagal "
        "pada log 25 Oktober 2026.",
        "Uji ketergunaan: belum ada data; protokol, instrumen, dan template rekap sudah siap "
        "di Bab 3–5.",
    ])
    add_callout(
        doc,
        "Aturan pengutipan",
        "Setiap angka harus menyebut instrumen, peserta, tanggal, dan berkas buktinya. Angka "
        "tanpa salah satu dari empat unsur itu sebaiknya tidak masuk laporan.",
        fill=LIGHT_TEAL, border=TEAL, title_color=TEAL,
    )


def bab3(doc: Document) -> None:
    add_chapter_heading(doc, "BAB 3  Desain Uji Ketergunaan Internal", level=1)
    add_para(doc, "Bab ini adalah protokol yang bisa langsung dijalankan. Jika bab ini dijalankan "
                  "dengan disiplin, tim akan memiliki data mentah yang cukup untuk menghitung SUS, "
                  "waktu keputusan, completion, dan error rate secara defendable.")

    doc.add_heading("3.1  Pertanyaan uji", level=2)
    add_bullets(doc, [
        "RQ1: Apakah peserta dapat menyelesaikan tugas utama tanpa bantuan?",
        "RQ2: Berapa waktu keputusan pada kondisi manual dan kondisi PreHub?",
        "RQ3: Berapa skor SUS PreHub pada peserta internal?",
        "RQ4: Hambatan apa yang muncul dan bagaimana kaitannya dengan temuan validasi praktisi?",
    ])

    doc.add_heading("3.2  Peserta", level=2)
    add_para(doc, "Target 10 peserta internal. Komposisi disusun agar tidak seluruhnya berasal "
                  "dari tim pengembang: minimal dua mahasiswa domain logistik dan satu role-play "
                  "koordinator operasional (total tiga peserta di luar tim pengembang inti). "
                  "Semua peserta menandatangani informed consent dan boleh berhenti kapan saja.")
    add_caption(doc, "Tabel 3.1. Komposisi peserta")
    add_table(doc, ["ID", "Peran", "Pengalaman dengan PreHub"], PARTICIPANT_ROWS,
              [1.5, 10.2, 5.0], font_size=9, center_cols={0})
    add_callout(
        doc,
        "Batas generalisasi",
        "Peserta adalah anggota tim dan mahasiswa, bukan dispatcher perusahaan. Skor SUS mereka "
        "dapat dipakai sebagai indikasi formatif, tetapi tidak boleh disebut \"SUS dispatcher\" "
        "atau digeneralisasi ke populasi operator logistik.",
        fill=AMBER, border="BF8F00", title_color="7F6000",
    )

    doc.add_heading("3.3  Skenario tugas", level=2)
    add_para(doc, "Gunakan satu skenario end-to-end yang sama untuk kedua kondisi. Skenario harus "
                  "memuat pencarian bukti, verifikasi, dan keputusan, bukan satu klik.")
    add_caption(doc, "Tabel 3.2. Skenario tugas")
    add_table(doc, ["Kode", "Tugas", "Kondisi awal", "Definisi selesai", "Batas", "Dicatat"],
              SCENARIO_ROWS, [1.0, 3.2, 4.1, 4.4, 1.5, 2.5], font_size=8.2,
              center_cols={0}, row_height=0.62, keep_together=True)

    doc.add_heading("3.4  Prosedur sesi", level=2)
    add_para(doc, "Urutan kondisi diacak: lima peserta mengerjakan manual lebih dulu, lima peserta "
                  "mengerjakan PreHub lebih dulu. Timer mulai saat fasilitator memberi sinyal dan "
                  "berhenti saat keputusan dikirim. Satu penguji menjadi fasilitator, satu penguji "
                  "mencatat waktu dan error.")
    add_caption(doc, "Tabel 3.3. Agenda sesi (60 menit)")
    add_table(doc, ["Menit", "Kegiatan"], AGENDA_ROWS, [2.2, 14.5], font_size=9)

    doc.add_heading("3.5  Metrik dan definisi operasional", level=2)
    add_caption(doc, "Tabel 3.4. Metrik, rumus, dan target")
    add_table(doc, ["Metrik", "Definisi / rumus", "Satuan", "Target", "Instrumen"],
              METRIC_ROWS, [3.8, 7.5, 1.5, 2.0, 3.0], font_size=8.5, first_col_bold=True)

    doc.add_heading("3.6  Analisis", level=2)
    add_para(doc, "Skor SUS dihitung per responden, lalu dirata-ratakan. Untuk item ganjil "
                  "(positif), poin = jawaban − 1. Untuk item genap (negatif), poin = 5 − jawaban. "
                  "Total poin 0–40 dikali 2,5 menjadi skor 0–100. Rata-rata lintas responden "
                  "adalah jumlah skor dibagi n.")
    add_para(doc, "Waktu keputusan dianalisis sebagai pasangan (manual vs PreHub) per peserta. "
                  "Uji normalitas dengan Shapiro–Wilk; jika normal, gunakan paired t-test; jika "
                  "tidak, gunakan Wilcoxon signed-rank. Laporkan median, IQR, selisih rata-rata, "
                  "CI 95%, dan effect size. Jangan hanya melaporkan mean.")
    add_caption(doc, "Tabel 3.5. Pemetaan grade SUS")
    add_table(doc, ["Grade", "Sauro–Lewis", "Bangor adjective", "Skor simulasi"],
              GRADE_ROWS, [2.0, 4.0, 6.0, 3.0], font_size=8.2, center_cols={0, 1, 3},
              row_height=0.48, keep_together=True)
    add_para(doc, "Catatan: 85,5 adalah A+ pada kurva Sauro–Lewis, bukan A. Pada skala Bangor, "
                  "85,5 tepat berada di batas Excellent/Best Imaginable. Karena itu, penulisan "
                  "\"Grade A / Excellent\" mencampur dua skala dan perlu diperbaiki.", size=8.5,
             italic=True, color=MID_GRAY)

    doc.add_heading("3.7  Ancaman validitas", level=2)
    add_caption(doc, "Tabel 3.6. Ancaman validitas dan mitigasi")
    add_table(doc, ["Ancaman", "Dampak", "Mitigasi"], THREAT_ROWS,
              [3.3, 6.7, 6.7], font_size=8.5, first_col_bold=True,
              keep_together=True)

    doc.add_heading("3.8  Rubrik penilaian keputusan", level=2)
    add_para(doc, "Agar error rate tidak bergantung pada selera penguji, gunakan rubrik berikut. "
                  "Keputusan dinilai benar jika memenuhi kriteria pada baris pertama. Kesalahan "
                  "minor tidak mengubah arah keputusan; kesalahan mayor mengubah arah atau "
                  "menghasilkan keputusan tanpa dasar bukti.")
    rubric = [
        ("Benar", "Memilih Continue, Reroute, atau Hold yang sesuai dengan bukti dan menyebut "
                  "minimal satu sumber serta alasannya.", "Tidak dihitung error"),
        ("Minor", "Arah keputusan benar, tetapi alasan tidak lengkap atau sumber tidak disebut.",
         "Dihitung 1 error minor"),
        ("Mayor", "Arah keputusan salah, atau keputusan diambil tanpa memeriksa bukti.",
         "Dihitung 1 error mayor"),
        ("Teknis", "Antarmuka gagal menampilkan data sehingga tugas tidak dapat diselesaikan.",
         "Dicatat terpisah; bukan error pengguna"),
    ]
    add_caption(doc, "Tabel 3.7. Rubrik penilaian keputusan")
    add_table(doc, ["Kategori", "Kriteria", "Perlakuan"], rubric,
              [2.4, 10.3, 4.0], font_size=8.8, first_col_bold=True,
              keep_together=True)


def bab4(doc: Document) -> None:
    add_chapter_heading(doc, "BAB 4  Instrumen", level=1)
    doc.add_heading("4.1  Kuesioner SUS (Bahasa Indonesia)", level=2)
    add_para(doc, "Gunakan skala 1–5: 1 = Sangat Tidak Setuju, 2 = Tidak Setuju, 3 = Netral, "
                  "4 = Setuju, 5 = Sangat Setuju. Item ganjil bernada positif, item genap bernada "
                  "negatif. Jangan mengubah urutan atau kata-kata item.")
    add_caption(doc, "Tabel 4.1. Instrumen SUS 10 item")
    sus_rows = [(no, text, polarity) for no, text, polarity in SUS_ITEMS]
    add_table(doc, ["No", "Pernyataan", "Arah"], sus_rows, [1.0, 13.7, 2.0],
              font_size=8.8, center_cols={0, 2})

    doc.add_heading("4.2  Lembar waktu tugas", level=2)
    add_para(doc, "Isi satu baris per peserta per kondisi. Waktu dicatat dalam menit dengan dua "
                  "angka desimal. Kolom \"Selesai\" diisi Ya/Tidak; kolom \"Error\" diisi jumlah "
                  "error yang memengaruhi keputusan.")
    add_caption(doc, "Tabel 4.2. Lembar waktu tugas (template)")
    blank_time = [("", "", "", "", "", "", "", "") for _ in range(10)]
    add_table(doc, ["ID", "Kondisi", "Mulai", "Selesai", "Durasi", "Selesai?", "Error", "Catatan"],
              blank_time, [1.2, 2.3, 1.7, 1.7, 1.8, 1.6, 1.3, 5.1], font_size=8.5,
              center_cols={0, 1, 4, 5, 6}, row_height=0.65, keep_together=True)

    doc.add_heading("4.3  Log error", level=2)
    add_para(doc, "Kategorikan error menjadi: salah membaca sumber, salah memilih mitigasi, salah "
                  "status approval, atau error teknis. Setiap error dicatat konteksnya, bukan hanya "
                  "jumlahnya.")
    add_caption(doc, "Tabel 4.3. Log error (template)")
    blank_err = [("", "", "", "", "", "") for _ in range(8)]
    add_table(doc, ["ID", "Tugas", "Jenis error", "Deskripsi", "Dampak", "Tindakan"],
              blank_err, [1.2, 1.4, 3.2, 5.2, 2.8, 2.9], font_size=8.5, center_cols={0, 1},
              row_height=0.65, keep_together=True)

    doc.add_heading("4.4  Wawancara singkat", level=2)
    add_para(doc, "Ajukan tiga pertanyaan terbuka setelah SUS. Jangan memancing jawaban positif.")
    add_caption(doc, "Tabel 4.4. Panduan wawancara")
    interview = [
        ("1", "Bagian mana yang paling membingungkan saat Anda mencari bukti?"),
        ("2", "Informasi apa yang Anda butuhkan tetapi tidak muncul di layar?"),
        ("3", "Jika Anda bisa mengubah satu hal, apa yang akan Anda ubah?"),
    ]
    add_table(doc, ["No", "Pertanyaan"], interview, [1.0, 15.7], font_size=9, center_cols={0},
              keep_together=True)

    doc.add_heading("4.5  Panduan penskoran SUS", level=2)
    add_para(doc, "Hitung per responden, lalu rata-ratakan. Contoh di bawah memakai R01 dari "
                  "data simulasi Bab 6; jangan menyalin angkanya ke laporan.")
    scoring = [
        ("Item ganjil (positif)", "Poin = jawaban − 1", "Q1=5→4; Q3=5→4; Q5=5→4; Q7=3→2; Q9=5→4"),
        ("Item genap (negatif)", "Poin = 5 − jawaban", "Q2=3→2; Q4=3→2; Q6=3→2; Q8=1→4; Q10=1→4"),
        ("Total poin", "Jumlah poin ganjil + genap", "18 + 14 = 32"),
        ("Skor responden", "Total poin × 2,5", "32 × 2,5 = 80,0"),
        ("Rata-rata", "Jumlah skor / n", "855 / 10 = 85,5"),
    ]
    add_caption(doc, "Tabel 4.5. Langkah penskoran SUS")
    add_table(doc, ["Langkah", "Rumus", "Contoh R01"], scoring,
              [3.6, 4.2, 8.9], font_size=8.8, first_col_bold=True,
              keep_together=True)


def bab5(doc: Document) -> None:
    add_chapter_heading(doc, "BAB 5  Lembar Kerja dan Template Rekapitulasi", level=1)
    add_para(doc, "Bab ini berisi tabel kosong yang harus diisi setelah uji. Simpan salinan "
                  "mentah (formulir yang dipindai atau CSV) di lampiran. Jangan hanya menyimpan "
                  "rata-rata.")

    doc.add_heading("5.1  Profil peserta", level=2)
    add_caption(doc, "Tabel 5.1. Profil peserta (template)")
    blank_part = [("", "", "") for _ in range(10)]
    add_table(doc, ["ID", "Peran", "Pengalaman"], blank_part, [1.5, 10.2, 5.0],
              font_size=9, center_cols={0}, row_height=0.65, keep_together=True)

    doc.add_heading("5.2  Data mentah SUS", level=2)
    add_caption(doc, "Tabel 5.2. Jawaban Q1–Q10 per responden (template)")
    blank_sus = [(f"R{i:02d}", "", "", "", "", "", "", "", "", "", "") for i in range(1, 11)]
    add_table(doc, ["ID", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"],
              blank_sus, [1.2] + [1.5] * 10,
              font_size=8.2, center_cols=set(range(1, 11)), row_height=0.6,
              keep_together=True)

    doc.add_heading("5.3  Perhitungan skor SUS", level=2)
    add_caption(doc, "Tabel 5.3. Perhitungan skor per responden (template)")
    blank_score = [(f"R{i:02d}", "", "", "", "", "") for i in range(1, 11)]
    add_table(doc, ["ID", "Σ ganjil (r−1)", "Σ genap (5−r)", "Total (0–40)", "Skor (×2,5)", "Grade"],
              blank_score, [1.4, 3.2, 3.2, 2.8, 3.0, 2.0], font_size=8.8,
              center_cols={0, 1, 2, 3, 4, 5}, row_height=0.6, keep_together=True)

    doc.add_heading("5.4  Rekap statistik SUS", level=2)
    add_caption(doc, "Tabel 5.4. Statistik deskriptif SUS (template)")
    stat_labels = ["N", "Mean", "Median", "SD", "Min", "Maks", "CI 95% mean", "Grade Sauro–Lewis",
                   "Adjective Bangor"]
    blank_stats = [(label, "") for label in stat_labels]
    add_table(doc, ["Statistik", "Nilai"], blank_stats, [6.0, 10.7], font_size=9,
              first_col_bold=True, row_height=0.6, keep_together=True)

    doc.add_heading("5.5  Waktu keputusan", level=2)
    add_caption(doc, "Tabel 5.5. Waktu keputusan manual vs PreHub (template)")
    blank_time = [(f"R{i:02d}", "", "", "", "", "", "", "") for i in range(1, 11)]
    add_table(doc, ["ID", "Urutan", "Manual (menit)", "PreHub (menit)", "Selisih", "Reduksi (%)",
                    "Keputusan manual", "Keputusan PreHub"],
              blank_time, [1.2, 2.4, 2.1, 2.1, 1.7, 1.7, 2.7, 2.7], font_size=8.2,
              center_cols={0, 1, 2, 3, 4, 5, 6, 7}, row_height=0.6, keep_together=True)

    doc.add_heading("5.6  Completion dan error", level=2)
    add_caption(doc, "Tabel 5.6. Task completion dan error (template)")
    blank_comp = [("Manual", "10", "", "", "", "", ""),
                  ("PreHub", "10", "", "", "", "", ""),
                  ("Total", "20", "", "", "", "", "")]
    add_table(doc, ["Kondisi", "Jumlah tugas", "Selesai", "First attempt", "Error", "Completion (%)",
                    "Error rate (%)"],
              blank_comp, [2.4, 2.4, 2.0, 2.4, 1.8, 3.2, 2.5], font_size=8.5,
              center_cols={1, 2, 3, 4, 5, 6}, row_height=0.7, keep_together=True)

    doc.add_heading("5.7  Ringkasan hasil", level=2)
    add_caption(doc, "Tabel 5.7. Ringkasan hasil (template)")
    blank_summary = [
        ("SUS mean", "", "", ""),
        ("Waktu manual (mean)", "", "", ""),
        ("Waktu PreHub (mean)", "", "", ""),
        ("Reduksi waktu", "", "", ""),
        ("Task completion", "", "", ""),
        ("Error rate", "", "", ""),
        ("Uji Wilcoxon (p)", "", "", ""),
    ]
    add_table(doc, ["Metrik", "Hasil", "Target", "Status"], blank_summary,
              [5.4, 4.2, 4.0, 3.1], font_size=9, first_col_bold=True,
              row_height=0.65, keep_together=True)


def bab6(doc: Document) -> None:
    add_chapter_heading(doc, "BAB 6  Simulasi Format Hasil", level=1)
    add_callout(
        doc,
        "SIMULASI — BUKAN DATA PENGUKURAN",
        "Seluruh angka pada Bab 6 dibuat untuk memperlihatkan bentuk tabel dan cara perhitungan. "
        "Angka ini tidak berasal dari peserta nyata dan tidak boleh dikutip sebagai hasil "
        "penelitian. Setelah uji dijalankan, ganti setiap tabel di bab ini dengan data mentah; "
        "jangan mempertahankan angka simulasi.",
        fill=RED, border="C00000", title_color="C00000",
    )
    add_para(doc, "", space_after=2)

    doc.add_heading("6.1  Profil peserta simulasi", level=2)
    add_caption(doc, "Tabel 6.1. Profil peserta (simulasi)")
    sim_part = [(SIM_IDS[i], SIM_ROLES[i], SIM_EXPERIENCE[i]) for i in range(10)]
    add_table(doc, ["ID", "Peran", "Pengalaman"], sim_part, [1.5, 10.2, 5.0],
              font_size=9, center_cols={0})

    doc.add_heading("6.2  Data mentah SUS simulasi", level=2)
    add_caption(doc, "Tabel 6.2. Jawaban Q1–Q10 (simulasi)")
    sim_raw = []
    for i, row in enumerate(SIM_SUS):
        sim_raw.append([SIM_IDS[i]] + [str(v) for v in row])
    add_table(doc, ["ID", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"],
              sim_raw, [1.2] + [1.5] * 10,
              font_size=8.2, center_cols=set(range(1, 11)), row_height=0.6,
              keep_together=True)

    doc.add_heading("6.3  Perhitungan skor SUS simulasi", level=2)
    add_para(doc, "Contoh perhitungan R01: item ganjil (Q1, Q3, Q5, Q7, Q9) = 5, 5, 5, 3, 5; "
                  "poin ganjil = 4 + 4 + 4 + 2 + 4 = 18. Item genap (Q2, Q4, Q6, Q8, Q10) = 3, 3, 3, "
                  "1, 1; poin genap = 2 + 2 + 2 + 4 + 4 = 14. Total = 32; skor = 32 × 2,5 = 80,0.")
    add_caption(doc, "Tabel 6.3. Perhitungan skor per responden (simulasi)")
    score_rows = []
    scores = []
    for i, row in enumerate(SIM_SUS):
        odd = sum((r - 1) for j, r in enumerate(row) if j % 2 == 0)
        even = sum((5 - r) for j, r in enumerate(row) if j % 2 == 1)
        pts = odd + even
        score = pts * 2.5
        scores.append(score)
        score_rows.append((SIM_IDS[i], str(odd), str(even), str(pts), f"{score:.1f}",
                           grade_sauro(score)))
    add_table(doc, ["ID", "Σ ganjil", "Σ genap", "Total", "Skor", "Grade"],
              score_rows, [1.4, 3.2, 3.2, 2.8, 3.0, 2.0], font_size=8.8,
              center_cols={0, 1, 2, 3, 4, 5}, row_height=0.58, keep_together=True)

    doc.add_heading("6.4  Statistik SUS simulasi", level=2)
    mean_sus = statistics.mean(scores)
    sd_sus = statistics.stdev(scores)
    median_sus = statistics.median(scores)
    ci_low = mean_sus - 2.262 * sd_sus / (10 ** 0.5)
    ci_high = mean_sus + 2.262 * sd_sus / (10 ** 0.5)
    add_caption(doc, "Tabel 6.4. Statistik deskriptif SUS (simulasi)")
    stats = [
        ("N", "10"),
        ("Mean", f"{mean_sus:.1f}"),
        ("Median", f"{median_sus:.1f}"),
        ("SD", f"{sd_sus:.2f}"),
        ("Min", f"{min(scores):.1f}"),
        ("Maks", f"{max(scores):.1f}"),
        ("CI 95% mean", f"{ci_low:.1f}–{ci_high:.1f}"),
        ("Grade Sauro–Lewis", grade_sauro(mean_sus)),
        ("Adjective Bangor", "Excellent (batas atas)"),
    ]
    add_table(doc, ["Statistik", "Nilai"], stats, [6.0, 10.7], font_size=9, first_col_bold=True,
              row_height=0.58, keep_together=True)

    doc.add_heading("6.5  Waktu keputusan simulasi", level=2)
    add_caption(doc, "Tabel 6.5. Waktu keputusan manual vs PreHub (simulasi)")
    time_rows = []
    for i in range(10):
        delta = SIM_MANUAL[i] - SIM_PREHUB[i]
        red = delta / SIM_MANUAL[i] * 100
        time_rows.append((SIM_IDS[i], SIM_ORDER[i], f"{SIM_MANUAL[i]:.1f}",
                          f"{SIM_PREHUB[i]:.1f}", f"{delta:.1f}", f"{red:.1f}",
                          SIM_MANUAL_CORRECT[i], SIM_PREHUB_CORRECT[i]))
    add_table(doc, ["ID", "Urutan", "Manual", "PreHub", "Selisih", "Reduksi (%)",
                    "Manual benar", "PreHub benar"],
              time_rows, [1.2, 2.6, 1.8, 1.8, 1.7, 2.0, 2.5, 2.5], font_size=8.2,
              center_cols=set(range(0, 8)), row_height=0.58, keep_together=True)

    mean_manual = statistics.mean(SIM_MANUAL)
    mean_pre = statistics.mean(SIM_PREHUB)
    mean_delta = statistics.mean([a - b for a, b in zip(SIM_MANUAL, SIM_PREHUB)])
    sd_delta = statistics.stdev([a - b for a, b in zip(SIM_MANUAL, SIM_PREHUB)])
    ci_d_low = mean_delta - 2.262 * sd_delta / (10 ** 0.5)
    ci_d_high = mean_delta + 2.262 * sd_delta / (10 ** 0.5)
    add_caption(doc, "Tabel 6.6. Ringkasan waktu (simulasi)")
    time_stats = [
        ("Manual — mean", f"{mean_manual:.1f} menit"),
        ("Manual — median", f"{statistics.median(SIM_MANUAL):.2f} menit"),
        ("PreHub — mean", f"{mean_pre:.1f} menit"),
        ("PreHub — median", f"{statistics.median(SIM_PREHUB):.2f} menit"),
        ("Selisih mean", f"{mean_delta:.1f} menit"),
        ("CI 95% selisih", f"{ci_d_low:.2f}–{ci_d_high:.2f} menit"),
        ("Reduksi relatif", f"{mean_delta / mean_manual * 100:.1f}%"),
        ("Wilcoxon signed-rank", "p = 0,002 (exact, dua sisi); r = 1,00"),
    ]
    add_table(doc, ["Statistik", "Nilai"], time_stats, [6.0, 10.7], font_size=9,
              first_col_bold=True, row_height=0.58, keep_together=True)

    doc.add_heading("6.6  Completion dan error simulasi", level=2)
    add_caption(doc, "Tabel 6.7. Task completion dan error (simulasi)")
    comp_rows = [
        ("Manual", "10", "10", "8", "2", "100,0", "20,0"),
        ("PreHub", "10", "10", "9", "1", "100,0", "10,0"),
        ("Total", "20", "20", "17", "3", "100,0", "15,0"),
    ]
    add_table(doc, ["Kondisi", "Tugas", "Selesai", "First attempt", "Error", "Completion (%)",
                    "Error rate (%)"],
              comp_rows, [2.4, 1.8, 1.8, 2.4, 1.6, 3.2, 2.5], font_size=8.8,
              center_cols=set(range(1, 7)), row_height=0.65, keep_together=True)

    doc.add_heading("6.7  Cek aritmatika dan konsistensi", level=2)
    add_para(doc, "Skor SUS tiap responden selalu kelipatan 2,5. Rata-rata n responden adalah "
                  "kelipatan 2,5/n. Karena itu, 85,5 hanya mungkin jika n kelipatan 5 (5, 10, 15, "
                  "20, ...). Untuk n = 10, jumlah sepuluh skor harus tepat 855. Jika sampel yang "
                  "dipakai 8 orang, 85,5 tidak mungkin secara aritmatika.")
    add_caption(doc, "Tabel 6.8. Cek aritmatika skor SUS")
    arith = [
        ("Bentuk skor", "Kelipatan 2,5", "0; 2,5; 5; ...; 100"),
        ("Rata-rata n=10", "Jumlah / 10", "855 / 10 = 85,5"),
        ("Rata-rata n=8", "Jumlah / 8", "Tidak mungkin 85,5"),
        ("Grade 85,5", "Sauro–Lewis", "A+ (bukan A)"),
        ("Adjective 85,5", "Bangor", "Batas Excellent/Best Imaginable"),
    ]
    add_table(doc, ["Item", "Aturan", "Implikasi"], arith, [3.2, 4.8, 8.7], font_size=9,
              first_col_bold=True, row_height=0.6, keep_together=True)

    doc.add_heading("6.8  Interpretasi simulasi", level=2)
    add_para(doc, "Jika data nyata menghasilkan pola seperti di atas, interpretasinya adalah: "
                  "ketergunaan yang dipersepsikan tinggi (SUS 85,5; A+ Sauro–Lewis), waktu "
                  "keputusan lebih singkat pada skenario terstandar (14,8 → 1,8 menit; 87,8%), "
                  "dan error rate lebih rendah (20% → 10%). Namun, karena peserta internal dan "
                  "skenario disusun tim, hasil ini tetap tidak dapat disebut sebagai bukti "
                  "efektivitas operasional. Diperlukan uji dengan dispatcher nyata dan skenario "
                  "lapangan sebelum klaim tersebut masuk laporan.")

    doc.add_heading("6.9  Mengganti simulasi dengan data nyata", level=2)
    replace_rows = [
        ("1", "Ganti Tabel 6.2 dengan jawaban Q1–Q10 asli dari formulir.", "Data mentah"),
        ("2", "Hitung ulang Tabel 6.3–6.4. Jangan menyalin angka simulasi.", "Skor dan statistik"),
        ("3", "Ganti Tabel 6.5–6.7 dengan timing log dan log error asli.", "Waktu dan error"),
        ("4", "Perbarui Tabel 7.1 dan hapus label \"Simulasi\" yang tidak berlaku.", "Kalimat klaim"),
        ("5", "Simpan versi simulasi sebagai arsip, bukan sebagai lampiran laporan.", "Versi dokumen"),
    ]
    add_caption(doc, "Tabel 6.9. Checklist penggantian data simulasi")
    add_table(doc, ["No", "Tindakan", "Berkas yang diganti"], replace_rows,
              [1.0, 11.6, 4.1], font_size=8.8, center_cols={0},
              row_height=0.65, keep_together=True)


def bab7(doc: Document) -> None:
    add_chapter_heading(doc, "BAB 7  Pernyataan Status dan Kalimat yang Aman", level=1)
    add_para(doc, "Bab ini memberikan kalimat alternatif yang bisa langsung dipakai di laporan. "
                  "Prinsipnya: sebut jenis bukti, sebut siapa pesertanya, sebut batasnya.")

    doc.add_heading("7.1  Matriks klaim", level=2)
    add_caption(doc, "Tabel 7.1. Klaim, status, dan kalimat yang aman")
    claim_rows = [
        ("SUS 85,5 (Grade A/Excellent)", "Simulasi",
         "Pada uji internal formatif dengan 10 anggota tim, skor SUS mencapai 85,5 (A+ Sauro–Lewis; "
         "Excellent pada skala Bangor). Hasil ini tidak digeneralisasi ke dispatcher operasional."),
        ("Waktu keputusan 14,8 → 1,8 menit", "Simulasi",
         "Pada skenario terstandar, rata-rata waktu keputusan turun dari 14,8 menjadi 1,8 menit "
         "(n=10; Wilcoxon p=0,002). Partisipan adalah anggota tim, bukan dispatcher."),
        ("7/7 fitur sesuai", "Tersedia",
         "PT Socfin Indonesia (surat draft, 20 Oktober 2026) menilai 7 dari 7 fitur utama "
         "\"Sesuai\"."),
        ("Semua mitra menilai semua fitur sesuai", "Tidak didukung",
         "Penilaian mitra bervariasi: PT MTI 3 Sesuai/5 Cukup sesuai; Bumi Sawita 5 Cukup "
         "sesuai/1 Sesuai sebagai prinsip; CV Bahana 4 kategori tertinggi/2 Sesuai."),
        ("137 test case lulus 100%", "Sebagian",
         "Log terakhir: 351 tes backend lulus dan 3 gagal; 93 tes E2E lulus dan 9 skip."),
        ("Siap operasional", "Tidak didukung",
         "PreHub adalah demonstrator decision-support; belum ada pilot dengan BULOG, Bapanas, "
         "atau operator armada."),
        ("UI sudah diuji dispatcher", "Tidak",
         "Uji ketergunaan dilakukan dengan peserta internal; pengujian dengan dispatcher nyata "
         "belum dijalankan."),
    ]
    add_table(doc, ["Klaim", "Status", "Kalimat yang aman"], claim_rows,
              [4.0, 2.2, 10.5], font_size=8.2,
              status_col=1, status_colors={"Tersedia": GREEN, "Sebagian": AMBER,
                                            "Simulasi": AMBER, "Tidak didukung": RED,
                                            "Tidak": RED})

    doc.add_heading("7.2  Rekomendasi", level=2)
    add_para(doc, "Ada dua jalan yang jujur, dan keduanya bisa dipertahankan di depan penguji.")
    add_lead_para(doc, "Opsi A — jalankan uji sekarang. ",
                  "Luangkan satu hari untuk 10 peserta. Cetak formulir di Lampiran A–B, siapkan "
                  "build, jalankan skenario D1–D3, isi Tabel 5.1–5.7, lalu ganti Bab 6 dengan data "
                  "nyata. Setelah itu, kalimat hasil boleh memakai angka dengan caveat \"uji "
                  "internal\".")
    add_lead_para(doc, "Opsi B — hapus angka. ",
                  "Pertahankan kalimat \"pengujian pengguna ditunda\" yang sudah ada di laporan. "
                  "Pindahkan target SUS dan waktu keputusan ke bagian Saran atau Keterbatasan. "
                  "Ini lebih aman daripada mempertahankan angka tanpa data.")
    add_para(doc, "Yang tidak boleh dilakukan: mengonversi \"Sesuai\" pada surat validasi menjadi "
                  "skor SUS, menyebut peserta internal sebagai dispatcher, atau mengutip Bab 6 "
                  "sebagai hasil pengukuran.")

    doc.add_heading("7.3  Checklist eksekusi", level=2)
    add_caption(doc, "Tabel 7.2. Checklist sebelum angka masuk laporan")
    checklist = [
        ("1", "Informed consent ditandatangani semua peserta", "Lampiran A", "☐"),
        ("2", "Build/commit hash dan URL uji dicatat", "Tangkapan layar/footer", "☐"),
        ("3", "Skenario dan data awal dibekukan", "Berkas skenario", "☐"),
        ("4", "Timer dan rekaman layar aktif", "Berkas rekaman", "☐"),
        ("5", "Formulir SUS 10 item terisi lengkap", "Lampiran B", "☐"),
        ("6", "Data mentah Q1–Q10 dimasukkan dua kali (double entry)", "Tabel 5.2", "☐"),
        ("7", "Rumus SUS dan grade diverifikasi", "Tabel 5.3–5.4", "☐"),
        ("8", "Uji Wilcoxon/paired test dijalankan", "Output statistik", "☐"),
        ("9", "Tabel 5.1–5.7 terisi dan Bab 6 diganti data nyata", "Dokumen ini", "☐"),
        ("10", "Batasan \"internal, bukan dispatcher\" ditulis di laporan", "Bab evaluasi", "☐"),
    ]
    add_table(doc, ["No", "Item", "Bukti", "Selesai"], checklist,
              [1.0, 9.8, 4.4, 1.5], font_size=8.3, center_cols={0, 3},
              row_height=0.55, keep_together=True)

    doc.add_heading("7.4  Contoh paragraf siap pakai", level=2)
    add_para(doc, "Paragraf berikut sudah memuat jenis bukti, peserta, dan batasannya. Ganti "
                  "angka di dalam kurung siku hanya setelah uji nyata dijalankan.")
    add_para(doc, "\"Uji ketergunaan internal dilakukan terhadap [n] anggota tim pada [tanggal] "
                  "dengan skenario [D1–D3]. Semua peserta menyelesaikan tugas (completion 100%); "
                  "skor SUS rata-rata [x] ([grade]). Karena peserta bukan dispatcher operasional, "
                  "hasil ini berfungsi sebagai evaluasi formatif dan tidak digeneralisasi.\"",
             italic=True, size=9.5)
    add_para(doc, "\"Pada skenario terstandar yang sama, rata-rata waktu keputusan turun dari "
                  "[x] menjadi [y] menit (n=[n]; Wilcoxon p=[p]). Penurunan ini konsisten pada "
                  "seluruh peserta, tetapi masih perlu diuji dengan dispatcher nyata.\"",
             italic=True, size=9.5)
    add_para(doc, "\"Validasi praktisi menunjukkan penilaian yang bervariasi: PT Socfin Indonesia "
                  "menilai 7/7 fitur 'Sesuai', PT MTI menilai 3/8 'Sesuai' dan 5/8 'Cukup sesuai', "
                  "sedangkan Bumi Sawita menilai 5/6 'Cukup sesuai'. Variasi ini menunjukkan "
                  "kebutuhan uji lapangan, bukan klaim kesesuaian menyeluruh.\"",
             italic=True, size=9.5)

    add_callout(
        doc,
        "Kalimat penutup yang disarankan",
        "Dengan memisahkan validasi praktisi, pengujian fungsional, dan uji ketergunaan internal, "
        "laporan dapat menunjukkan rantai bukti yang jelas: apa yang sudah diuji, siapa yang "
        "menguji, dan apa yang belum boleh diklaim. Kejujuran status ini lebih kuat daripada angka "
        "yang tidak dapat dipertanggungjawabkan.",
        fill=LIGHT_TEAL, border=TEAL, title_color=TEAL,
    )


def lampiran(doc: Document) -> None:
    add_chapter_heading(doc, "LAMPIRAN A  Formulir Persetujuan", level=1)
    add_para(doc, "Saya telah menerima penjelasan tentang tujuan, prosedur, durasi, dan risiko "
                  "kegiatan ini. Saya memahami bahwa partisipasi bersifat sukarela dan saya dapat "
                  "berhenti kapan saja tanpa konsekuensi. Saya menyetujui data tugas, waktu, dan "
                  "jawaban kuesioner saya digunakan untuk evaluasi internal PreHub.")
    consent_rows = [
        ("Nama peserta", ""),
        ("Peran / afiliasi", ""),
        ("Tanggal", ""),
        ("Tanda tangan", ""),
        ("Nama penguji", ""),
        ("Tanda tangan penguji", ""),
    ]
    add_table(doc, ["Item", "Keterangan"], consent_rows, [5.0, 11.7], font_size=9,
              first_col_bold=True, row_height=0.9)
    add_para(doc, "Catatan: formulir ini bukan kontrak dan tidak boleh memuat klausa yang "
                  "melepaskan hak peserta.", size=8, italic=True, color=MID_GRAY)

    doc.add_heading("LAMPIRAN B  Formulir SUS Cetak", level=1)
    add_para(doc, "Lingkari satu angka untuk setiap pernyataan. Skala: 1 = Sangat Tidak Setuju; "
                  "2 = Tidak Setuju; 3 = Netral; 4 = Setuju; 5 = Sangat Setuju.")
    form_rows = []
    for no, text, polarity in SUS_ITEMS:
        form_rows.append((no, text, "☐ 1", "☐ 2", "☐ 3", "☐ 4", "☐ 5"))
    add_table(doc, ["No", "Pernyataan", "1", "2", "3", "4", "5"], form_rows,
              [0.8, 8.0, 1.5, 1.5, 1.5, 1.5, 1.5], font_size=8.2, center_cols={0, 2, 3, 4, 5, 6})
    add_para(doc, "Nama/ID: ______________________    Tanggal: ____________    "
                  "Build: ______________________", size=9, space_before=6)

    add_chapter_heading(doc, "LAMPIRAN C  Daftar Berkas Bukti", level=1)
    add_para(doc, "Simpan berkas berikut bersama dokumen ini. Jika dikirim ke penguji, sertakan "
                  "salinan, bukan hanya tautan.")
    evidence = [
        ("1", "Surat validasi PT MTI", "PDF", "Tersedia"),
        ("2", "Surat validasi CV Bahana Mandiri", "PDF", "Tersedia"),
        ("3", "Surat validasi PT Socfin Indonesia", "PDF", "Draft"),
        ("4", "Surat validasi Bumi Sawita", "PDF", "Tersedia"),
        ("5", "Draft validasi Ditmawalumni USU", "DOCX", "Draft"),
        ("6", "Dokumentasi wawancara PT Rahmat Mandiri Sentosa", "PDF", "Tersedia"),
        ("7", "Log pytest", "TXT", "Tersedia"),
        ("8", "Log Playwright", "TXT", "Tersedia"),
        ("9", "Formulir SUS terisi", "PDF/scan", "Belum"),
        ("10", "Timing log dan rekaman", "CSV/MP4", "Belum"),
        ("11", "Matriks data mentah SUS", "CSV/XLSX", "Belum"),
        ("12", "Output analisis (SUS, Wilcoxon)", "PDF/notebook", "Belum"),
    ]
    add_table(doc, ["No", "Berkas", "Format", "Status"], evidence,
              [1.0, 10.0, 3.0, 2.7], font_size=8.8,
              status_col=3, status_colors={"Tersedia": GREEN, "Draft": AMBER, "Belum": RED},
              row_height=0.6, keep_together=True)

    doc.add_heading("LAMPIRAN D  Kutipan Validasi Praktisi", level=1)
    add_para(doc, "Kutipan berikut diambil dari surat/dokumen mitra. Gunakan sebagai bukti "
                  "kualitatif, bukan sebagai skor SUS.")
    quotes = [
        ("PT MTI", "\"Kesalahan atau keterlambatan informasi dalam penanganan distribusi pangan "
                   "dan komoditas dapat berdampak fatal...\""),
        ("PT MTI", "\"Pertahankan mekanisme verifikasi data resmi dan kewenangan pengesahan rute "
                   "oleh operator/manajemen operasional.\""),
        ("CV Bahana Mandiri", "\"Mekanisme validasi silang antarsumber berhasil mengurangi risiko "
                              "informasi palsu (false alarm) dan memberikan kepastian informasi "
                              "yang lebih baik.\""),
        ("CV Bahana Mandiri", "\"Fitur rekomendasi tindakan ... sangat fungsional dan memberikan "
                              "opsi solusi yang terstruktur saat terjadi gangguan mendadak.\""),
        ("PT Socfin Indonesia", "\"Perusahaan sangat membutuhkan kepastian lokasi armada secara "
                                "pasti demi faktor keselamatan (safety).\""),
        ("PT Socfin Indonesia", "\"Pertahankan peran operator/Dispatcher sebagai penentu keputusan "
                                "akhir terhadap setiap saran rute yang diberikan sistem.\""),
        ("Bumi Sawita", "\"Manfaat sistem perlu dibuktikan melalui hasil operasional, bukan hanya "
                        "kelengkapan fitur atau penggunaan AI.\""),
        ("Bumi Sawita", "\"Tetapkan indikator uji seperti waktu dari kejadian hingga peringatan, "
                        "ketepatan deteksi, jumlah alarm palsu, ketepatan estimasi keterlambatan, "
                        "dan waktu yang dibutuhkan operator untuk menentukan tindakan.\""),
        ("Ditmawalumni USU", "\"Efektivitas sistem pendukung keputusan logistik sangat ditentukan "
                             "oleh kemampuannya memotret kondisi nyata di jalur distribusi "
                             "darat.\""),
        ("Ditmawalumni USU", "\"Pertahankan arsitektur Human-in-the-Loop di mana analisis "
                             "komprehensif diakses oleh tim manajemen operasional.\""),
    ]
    add_table(doc, ["Mitra", "Kutipan"], quotes, [3.6, 13.1], font_size=8.2,
              first_col_bold=True)

    add_para(doc, "", space_after=6)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("— Selesai —")
    r.font.size = Pt(9)
    r.font.color.rgb = _rgb(MID_GRAY)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    doc = Document()
    setup_styles(doc)
    setup_page(doc)

    doc.core_properties.title = "Dokumen Pengujian Internal Ketergunaan PreHub"
    doc.core_properties.subject = "Protokol, instrumen, dan rekapitulasi bukti uji internal"
    doc.core_properties.author = "Tim PreHub GEMASTIK 2026 — Universitas Sumatera Utara"
    doc.core_properties.keywords = "PreHub, SUS, usability, internal validation, GEMASTIK 2026"
    doc.core_properties.comments = (
        "Bab 6 adalah simulasi format, bukan data pengukuran. "
        "Ganti dengan data mentah setelah uji dijalankan."
    )

    cover(doc)
    status_page(doc)
    toc_page(doc)
    bab1(doc)
    bab2(doc)
    bab3(doc)
    bab4(doc)
    bab5(doc)
    bab6(doc)
    bab7(doc)
    lampiran(doc)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc.save(OUT)
    print(f"Saved: {OUT}")


if __name__ == "__main__":
    main()
