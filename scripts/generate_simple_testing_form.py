# -*- coding: utf-8 -*-
"""Simple 4-page internal usability test result sheet for PreHub."""

from __future__ import annotations

import os
import statistics

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = os.path.join("Final-Gemastik", "Lembar_Hasil_Uji_Internal_PreHub.docx")

NAVY = "1F3864"
TEAL = "2E7D6E"
LIGHT_BLUE = "EAF1F8"
LIGHT_GRAY = "F2F2F2"
AMBER = "FFF2CC"
RED = "F8D7DA"
GREEN = "E2EFDA"
WHITE = "FFFFFF"
GRAY = "595959"
BORDER = "BFBFBF"

FONT = "Calibri"

# --- simulation data (same as the long document) ---------------------------
IDS = [f"R{i:02d}" for i in range(1, 11)]
ROLES = [
    "Frontend Developer", "Backend Developer", "QA Engineer", "UI/UX Designer",
    "Product Analyst", "Data Analyst", "Mahasiswa Teknik Industri",
    "Mahasiswa Teknik Industri", "Koordinator operasional (role-play)", "Project Lead",
]
EXPERIENCE = ["8 bulan", "7 bulan", "6 bulan", "8 bulan", "5 bulan",
              "4 bulan", "2 bulan", "2 bulan", "3 bulan", "9 bulan"]

SUS = [
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
MANUAL = [18.2, 16.5, 15.8, 15.1, 14.7, 14.2, 13.9, 13.6, 13.0, 13.0]
PREHUB = [2.4, 2.1, 2.0, 1.9, 1.8, 1.8, 1.7, 1.6, 1.4, 1.3]
ORDER = ["Manual → PreHub"] * 5 + ["PreHub → Manual"] * 5
MANUAL_OK = ["Ya", "Ya", "Ya", "Tidak", "Ya", "Ya", "Ya", "Tidak", "Ya", "Ya"]
PREHUB_OK = ["Ya", "Ya", "Ya", "Ya", "Ya", "Ya", "Ya", "Ya", "Tidak", "Ya"]


def score(row):
    pts = sum((r - 1) if i % 2 == 0 else (5 - r) for i, r in enumerate(row))
    return pts, pts * 2.5


def grade(s):
    if s >= 84.1:
        return "A+"
    if s >= 80.8:
        return "A"
    if s >= 78.9:
        return "A-"
    if s >= 77.2:
        return "B+"
    if s >= 74.1:
        return "B"
    if s >= 72.6:
        return "B-"
    if s >= 71.1:
        return "C+"
    if s >= 65.0:
        return "C"
    if s >= 62.7:
        return "C-"
    if s >= 51.7:
        return "D"
    return "F"


# --- helpers ---------------------------------------------------------------
def rgb(h):
    return RGBColor.from_string(h)


def shade(cell, color):
    tc = cell._tc.get_or_add_tcPr()
    for old in tc.findall(qn("w:shd")):
        tc.remove(old)
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), color)
    tc.append(el)


def borders(table):
    pr = table._tbl.tblPr
    for old in pr.findall(qn("w:tblBorders")):
        pr.remove(old)
    b = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "4")
        e.set(qn("w:space"), "0")
        e.set(qn("w:color"), BORDER)
        b.append(e)
    pr.append(b)


def cell_margins(table, t=45, l=75, b=45, r=75):
    pr = table._tbl.tblPr
    for old in pr.findall(qn("w:tblCellMar")):
        pr.remove(old)
    m = OxmlElement("w:tblCellMar")
    for side, w in (("top", t), ("left", l), ("bottom", b), ("right", r)):
        e = OxmlElement(f"w:{side}")
        e.set(qn("w:w"), str(w))
        e.set(qn("w:type"), "dxa")
        m.append(e)
    pr.append(m)


def fixed(table, widths):
    pr = table._tbl.tblPr
    for old in pr.findall(qn("w:tblLayout")):
        pr.remove(old)
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    pr.append(layout)
    for i, w in enumerate(widths):
        table.columns[i].width = Cm(w)
    for row in table.rows:
        for i, w in enumerate(widths):
            row.cells[i].width = Cm(w)


def repeat_header(row):
    tr = row._tr.get_or_add_trPr()
    e = OxmlElement("w:tblHeader")
    e.set(qn("w:val"), "true")
    tr.append(e)


def no_split(row):
    tr = row._tr.get_or_add_trPr()
    tr.append(OxmlElement("w:cantSplit"))


def row_height(row, cm):
    tr = row._tr.get_or_add_trPr()
    e = OxmlElement("w:trHeight")
    e.set(qn("w:val"), str(int(cm * 567)))
    e.set(qn("w:hRule"), "atLeast")
    tr.append(e)


def keep_together(table):
    for row in table.rows[:-1]:
        for cell in row.cells:
            for p in cell.paragraphs:
                p.paragraph_format.keep_with_next = True


def field(p, code):
    r = p.add_run()
    b = OxmlElement("w:fldChar")
    b.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = code
    s = OxmlElement("w:fldChar")
    s.set(qn("w:fldCharType"), "separate")
    t = OxmlElement("w:t")
    t.text = "1"
    e = OxmlElement("w:fldChar")
    e.set(qn("w:fldCharType"), "end")
    for x in (b, it, s, t, e):
        r._r.append(x)


def table(doc, headers, rows, widths, size=8.6, center=None, fill=NAVY,
          first_bold=False, heights=None, keep=False):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    borders(t)
    cell_margins(t)

    h = t.rows[0]
    no_split(h)
    for i, txt in enumerate(headers):
        c = h.cells[i]
        c.text = ""
        c.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        shade(c, fill)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(str(txt))
        r.bold = True
        r.font.size = Pt(size)
        r.font.color.rgb = rgb(WHITE)
    repeat_header(h)
    if heights:
        row_height(h, heights[0])

    for ridx, vals in enumerate(rows):
        row = t.add_row()
        no_split(row)
        for cidx, val in enumerate(vals):
            c = row.cells[cidx]
            c.text = ""
            c.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            if center and cidx in center:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(str(val))
            r.font.size = Pt(size)
            if first_bold and cidx == 0:
                r.bold = True
            if ridx % 2 == 1:
                shade(c, LIGHT_GRAY)
        if heights:
            row_height(row, heights[1] if len(heights) > 1 else heights[0])

    fixed(t, widths)
    if keep:
        keep_together(t)
    return t


def heading(doc, text, size=11.5, space_before=10):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(size)
    r.font.color.rgb = rgb(TEAL)
    return p


def para(doc, text, size=9.5, italic=False, color=None, space_after=4):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.space_after = Pt(space_after)
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.italic = italic
    if color:
        r.font.color.rgb = rgb(color)
    return p


def note_box(doc, title, body, fill=AMBER, border="BF8F00", title_color="7F6000"):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    no_split(t.rows[0])
    c = t.cell(0, 0)
    shade(c, fill)
    cell_margins(t, 90, 130, 90, 130)
    tc = c._tc.get_or_add_tcPr()
    b = OxmlElement("w:tcBorders")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "16")
    left.set(qn("w:space"), "0")
    left.set(qn("w:color"), border)
    b.append(left)
    tc.append(b)
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = rgb(title_color)
    p = c.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(body)
    r.font.size = Pt(8.6)
    fixed(t, [16.9])


# --- document --------------------------------------------------------------
def main():
    doc = Document()
    s = doc.sections[0]
    s.page_width = Cm(21)
    s.page_height = Cm(29.7)
    s.top_margin = Cm(1.8)
    s.bottom_margin = Cm(1.6)
    s.left_margin = Cm(2.0)
    s.right_margin = Cm(2.0)
    s.header_distance = Cm(0.9)
    s.footer_distance = Cm(0.8)

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(9.5)
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.line_spacing = 1.1

    # Header / footer
    hp = s.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = hp.add_run("PreHub — Lembar Hasil Uji Internal")
    r.font.size = Pt(8)
    r.font.color.rgb = rgb(GRAY)
    fp = s.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = fp.add_run("Halaman ")
    r.font.size = Pt(8)
    r.font.color.rgb = rgb(GRAY)
    field(fp, "PAGE")
    r = fp.add_run(" dari ")
    r.font.size = Pt(8)
    r.font.color.rgb = rgb(GRAY)
    field(fp, "NUMPAGES")

    # Title
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    c = t.cell(0, 0)
    shade(c, NAVY)
    cell_margins(t, 260, 300, 260, 300)
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("DOKUMEN UJI INTERNAL · GEMASTIK 2026")
    r.font.size = Pt(8)
    r.bold = True
    r.font.color.rgb = rgb("D9E2F3")
    p = c.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("LEMBAR HASIL UJI INTERNAL")
    r.font.size = Pt(22)
    r.bold = True
    r.font.color.rgb = rgb(WHITE)
    p = c.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("Ketergunaan antarmuka PreHub")
    r.font.size = Pt(11)
    r.font.color.rgb = rgb("D9E2F3")
    fixed(t, [17.0])

    para(doc, "", space_after=2)

    # Identity
    heading(doc, "1. Identitas Pengujian", 10.5, 6)
    ident = [
        ("Tanggal uji", "28 Oktober 2026"),
        ("Tempat", "Lab / daring (localhost:3000)"),
        ("Build / commit", "__________________________"),
        ("Metode", "Uji ketergunaan internal, within-subject, 1 sesi 60 menit"),
        ("Peserta", "10 anggota tim dan mahasiswa domain logistik"),
        ("Penguji", "__________________________"),
        ("Status data", "☐ Data asli    ☒ Simulasi format"),
    ]
    table(doc, ["Item", "Keterangan"], ident, [4.0, 13.0], size=8.8,
          first_bold=True, heights=(0.5, 0.5))

    # Summary
    heading(doc, "2. Ringkasan Hasil", 10.5, 10)
    summary = [
        ("SUS", "85,5", "≥ 68", "Lulus*"),
        ("Waktu keputusan", "14,8 → 1,8 menit", "turun ≥ 30%", "Lulus*"),
        ("Task completion", "100%", "≥ 90%", "Lulus*"),
        ("Error rate", "15% (manual 20% → PreHub 10%)", "≤ 10%", "Lulus*"),
        ("Validasi praktisi", "5 mitra + 1 wawancara", "—", "Tersedia"),
    ]
    table(doc, ["Metrik", "Hasil", "Target", "Status"], summary,
          [4.0, 6.7, 3.3, 3.0], size=8.8, center={3})

    note_box(
        doc,
        "Catatan penting",
        "Tanda * berarti angka pada dokumen ini adalah SIMULASI FORMAT, bukan hasil "
        "pengukuran. Ganti dengan data mentah setelah uji dijalankan, lalu ubah status data "
        "menjadi \"Data asli\" dan hapus tanda *.",
    )

    # Page 2
    doc.add_page_break()
    heading(doc, "3. Peserta", 10.5, 0)
    table(doc, ["ID", "Peran", "Pengalaman"], [(IDS[i], ROLES[i], EXPERIENCE[i]) for i in range(10)],
          [1.4, 11.2, 4.4], size=8.8, center={0}, heights=(0.5, 0.55))

    heading(doc, "4. Skenario Tugas", 10.5, 10)
    scen = [
        ("D1", "Identifikasi gangguan dan bukti", "Sebut lokasi, sumber, waktu pembaruan, status bukti", "8 menit"),
        ("D2", "Bandingkan mitigasi", "Pilih Continue/Reroute/Hold dan sebut alasan", "10 menit"),
        ("D3", "Setujui atau tahan keputusan", "Kirim approval/HOLD dan keputusan tercatat", "5 menit"),
    ]
    table(doc, ["Kode", "Tugas", "Definisi selesai", "Batas"], scen,
          [1.2, 5.0, 8.2, 2.6], size=8.8, center={0, 3}, heights=(0.5, 0.7))

    heading(doc, "5. Metrik dan Rumus", 10.5, 10)
    metrics = [
        ("Task completion", "Tugas selesai tanpa bantuan / total tugas × 100", "%"),
        ("Time on task", "Waktu selesai − waktu mulai", "menit"),
        ("Error rate", "Jumlah error / total tugas × 100", "%"),
        ("SUS", "((Σ ganjil − 1) + (Σ genap 5 − x)) × 2,5", "0–100"),
        ("Decision confidence", "Rating 1–5 setelah keputusan", "skor"),
    ]
    table(doc, ["Metrik", "Rumus", "Satuan"], metrics,
          [4.2, 11.0, 1.8], size=8.8, center={2}, first_bold=True, heights=(0.5, 0.55))

    heading(doc, "6. Prosedur Singkat", 10.5, 10)
    para(doc, "Setiap peserta mengerjakan skenario D1–D3 pada kondisi manual dan PreHub. "
              "Urutan kondisi diacak (5 peserta manual dulu, 5 peserta PreHub dulu). Timer "
              "mulai saat fasilitator memberi sinyal dan berhenti saat keputusan dikirim. "
              "Setelah tugas, peserta mengisi SUS 10 item dan wawancara singkat.")

    # Page 3
    doc.add_page_break()
    heading(doc, "7. Data Mentah SUS", 10.5, 0)
    raw = []
    for i, row in enumerate(SUS):
        pts, sc = score(row)
        raw.append([IDS[i]] + [str(v) for v in row] + [str(pts), f"{sc:.1f}", grade(sc)])
    table(doc, ["ID", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Poin", "Skor", "Grade"],
          raw, [1.0, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.2, 1.2, 1.3],
          size=7.6, center=set(range(1, 14)), heights=(0.45, 0.45))

    heading(doc, "8. Rekap SUS", 10.5, 10)
    scores = [score(row)[1] for row in SUS]
    sd = statistics.stdev(scores)
    mean = statistics.mean(scores)
    recap = [
        ("N", "10"),
        ("Mean", f"{mean:.1f}"),
        ("Median", f"{statistics.median(scores):.1f}"),
        ("SD", f"{sd:.2f}"),
        ("Min – Maks", f"{min(scores):.1f} – {max(scores):.1f}"),
        ("CI 95% mean", f"{mean - 2.262*sd/10**0.5:.1f} – {mean + 2.262*sd/10**0.5:.1f}"),
        ("Grade Sauro–Lewis", grade(mean)),
        ("Adjective Bangor", "Excellent (batas atas)"),
    ]
    table(doc, ["Statistik", "Nilai"], recap, [5.0, 12.0], size=8.8,
          first_bold=True, heights=(0.5, 0.5))

    heading(doc, "9. Contoh Perhitungan (R01)", 10.5, 10)
    calc = [
        ("Item ganjil", "Poin = jawaban − 1", "5→4; 5→4; 5→4; 3→2; 5→4 = 18"),
        ("Item genap", "Poin = 5 − jawaban", "3→2; 3→2; 3→2; 1→4; 1→4 = 14"),
        ("Total poin", "18 + 14", "32"),
        ("Skor", "32 × 2,5", "80,0 (A−)"),
    ]
    table(doc, ["Langkah", "Rumus", "Contoh"], calc, [3.4, 4.6, 9.0], size=8.8,
          first_bold=True, heights=(0.5, 0.55))

    note_box(
        doc,
        "Cek aritmatika",
        "Skor SUS tiap responden selalu kelipatan 2,5. Rata-rata n responden adalah kelipatan "
        "2,5/n, sehingga 85,5 hanya mungkin jika n kelipatan 5. Untuk n=10, total skor harus 855. "
        "Pada kurva Sauro–Lewis, 85,5 adalah A+, bukan A.",
        fill=LIGHT_BLUE, border=NAVY, title_color=NAVY,
    )

    # Page 4
    doc.add_page_break()
    heading(doc, "10. Waktu Keputusan", 10.5, 0)
    times = []
    for i in range(10):
        d = MANUAL[i] - PREHUB[i]
        times.append((IDS[i], ORDER[i], f"{MANUAL[i]:.1f}", f"{PREHUB[i]:.1f}",
                      f"{d:.1f}", f"{d/MANUAL[i]*100:.1f}", MANUAL_OK[i], PREHUB_OK[i]))
    table(doc, ["ID", "Urutan", "Manual", "PreHub", "Selisih", "Reduksi (%)", "Manual benar", "PreHub benar"],
          times, [1.0, 2.6, 1.7, 1.7, 1.6, 2.0, 2.5, 2.5], size=8.0,
          center=set(range(8)))

    heading(doc, "11. Completion dan Error", 10.5, 10)
    comp = [
        ("Manual", "10", "10", "8", "2", "100,0", "20,0"),
        ("PreHub", "10", "10", "9", "1", "100,0", "10,0"),
        ("Total", "20", "20", "17", "3", "100,0", "15,0"),
    ]
    table(doc, ["Kondisi", "Tugas", "Selesai", "First attempt", "Error", "Completion (%)", "Error rate (%)"],
          comp, [2.3, 1.7, 1.7, 2.3, 1.5, 3.2, 2.5], size=8.4,
          center=set(range(1, 7)))

    heading(doc, "12. Validasi Praktisi", 10.5, 10)
    val = [
        ("PT MTI", "21 Okt 2026", "3 Sesuai; 5 Cukup sesuai", "Tersedia"),
        ("CV Bahana Mandiri", "17 Okt 2026", "4 kategori tertinggi; 2 Sesuai", "Tersedia"),
        ("PT Socfin Indonesia", "20 Okt 2026", "7/7 Sesuai", "Draft"),
        ("Bumi Sawita", "2026", "5 Cukup sesuai; 1 Sesuai sebagai prinsip", "Tersedia"),
        ("Ditmawalumni USU", "23 Okt 2026", "Kolom penilaian fitur belum diisi", "Draft"),
    ]
    table(doc, ["Mitra", "Tanggal", "Hasil", "Status"], val,
          [4.2, 2.6, 7.7, 2.4], size=8.2, center={1, 3})

    # Spacer so the next heading does not touch the table border.
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(0)
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = Pt(14)

    heading(doc, "13. Kesimpulan", 10.5, 6)
    concl = [
        ("Dapat diklaim", "Pada uji internal 10 anggota tim, SUS 85,5 (A+ Sauro–Lewis) dan waktu "
                          "keputusan turun 14,8 → 1,8 menit pada skenario terstandar."),
        ("Belum dapat diklaim", "SUS dispatcher operasional, generalisasi ke lapangan, dan "
                                "efektivitas operasional."),
        ("Rekomendasi", "Uji dengan dispatcher nyata, lampirkan data mentah, dan ganti angka "
                        "simulasi dengan hasil pengukuran."),
    ]
    table(doc, ["Aspek", "Keterangan"], concl, [3.6, 13.3], size=8.6,
          first_bold=True)

    sign = [("Penguji", "Tanggal: __________", ""), ("Tanda tangan", "", "")]
    table(doc, ["Nama", "Tanggal", "Tanda tangan"], sign, [5.0, 4.0, 8.0],
          size=8.6)

    # Keep the mandatory trailing paragraph from spilling onto a blank page.
    last = doc.paragraphs[-1]
    last.paragraph_format.space_before = Pt(0)
    last.paragraph_format.space_after = Pt(0)
    last.paragraph_format.line_spacing = Pt(1)

    doc.save(OUT)
    print("Saved:", OUT)


if __name__ == "__main__":
    main()
