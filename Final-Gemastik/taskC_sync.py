"""Task C — Validasi wiring Laporan-PreHub (SDT-safe, run-level only).

Backup .bak-YYYYMMDD-HHMMSS dulu, lalu:
1. Lampiran B: tambah 4 kutipan verbatim (B.3 penutup, B.4 Socfin riil + USU jalur,
   B.5 RMS reaktif). B.1/B.2 pindaian tetap tanpa kutipan verbatim.
2. Tabel VII.4 ringkasan 5 sumber di akhir Pengujian Implementasi (caption polos,
   tanpa host+tanggal).
3. 6 Kotak Sinkronisasi Proposal-Laporan (3 di Latar Belakang, 3 di Metodologi),
   tabel perbandingan di Batasan, peta jalan di Metodologi, 8 stub per-BAB,
   2 butir changelog.
4. Hitung ulang + audit SDT/Mendeley/BIB. SDT tidak disentuh (hanya run/table baru).
"""
import datetime
import hashlib
import pathlib
import shutil
import zipfile

from docx import Document
from docx.shared import Pt  # noqa: F401 (kept for future sizing; unused)

SRC = pathlib.Path("Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx")


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def pkg_counts(path):
    z = zipfile.ZipFile(str(path))
    xml = z.read("word/document.xml").decode("utf8")
    return {
        "sdt": xml.count("w:sdt"),
        "mendeley_cit": xml.count("MENDELEY_CITATION"),
        "mendeley_bib": xml.count("MENDELEY_BIBLIOGRAPHY"),
        "bib_sdt": "MENDELEY_BIBLIOGRAPHY" in xml,
    }


print("SHA_BEFORE=" + sha(SRC))
before = pkg_counts(SRC)
print("PKG_BEFORE=" + str(before))
d = Document(str(SRC))
print(f"DOC_BEFORE paras={len(d.paragraphs)} tables={len(d.tables)} shapes={len(d.inline_shapes)}")

ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
backup = SRC.parent / f"Laporan-PreHub-GEMASTIK19.bak-{ts}.docx"
shutil.copy2(SRC, backup)
print(f"BACKUP={backup} sha={sha(backup)[:16]}")

edited = []


def append_run_text(idx, addition):
    """Tambah teks ke run non-kosong terakhir (format + SDT tidak tersentuh)."""
    para = d.paragraphs[idx]
    cand = [r for r in para.runs if r.text.strip() != ""]
    if cand:
        cand[-1].text = cand[-1].text + addition
    elif para.runs:
        para.runs[-1].text = addition
    else:
        para.add_run(addition)
    edited.append(idx)


# ---- 1. Lampiran B: kutipan verbatim dari berkas sumber ----
append_run_text(
    308,
    ' Penutup surat menegaskan: "Rekomendasi sistem sebaiknya tetap menjadi bahan '
    'pertimbangan operator, bukan pengganti verifikasi dan kewenangan manusia."',
)
append_run_text(
    312,
    ' Soal kondisi jalan nyata, surat meminta: "Sumber data yang disajikan harus '
    'benar-benar valid, terutama terkait kondisi lalu lintas riil di lapangan"; rute '
    'alternatif "dipastikan aman dan tidak mengarahkan armada ke jalan yang rusak '
    'atau berlubang".',
)
append_run_text(
    314,
    ' Surat juga menilai efektivitas sistem "sangat ditentukan oleh kemampuannya '
    'memotret kondisi nyata di jalur distribusi darat".',
)
append_run_text(
    317,
    ' Temuan diringkas sebagai kendala yang "baru diketahui secara reaktif ketika '
    'armada mobil sudah terlanjur berada di tengah perjalanan".',
)


def new_para(text, style="Normal", bold_lead=None):
    p = d.add_paragraph(style=style)
    if bold_lead:
        r = p.add_run(bold_lead)
        r.bold = True
        p.add_run(text)
    else:
        p.add_run(text)
    return p


def insert_after(anchor_idx, elements):
    """Sisipkan elemen (para/table) tepat setelah anchor, urutan terjaga."""
    ref = d.paragraphs[anchor_idx]._element
    for el in elements:
        ref.addnext(el)
        ref = el


def new_table(header, rows, style="Table Grid"):
    t = d.add_table(rows=1 + len(rows), cols=len(header))
    t.style = style
    for j, h in enumerate(header):
        cell = t.rows[0].cells[j]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
    for i, row in enumerate(rows, start=1):
        for j, val in enumerate(row):
            cell = t.rows[i].cells[j]
            cell.text = ""
            cell.paragraphs[0].add_run(val)
    return t


# ---- 2/3. Blok sisipan (anchor menurun agar indeks stabil) ----
BOX_S1 = ("Batas produk. Proposal menyatakan data masih banyak disimulasikan dan "
          "keputusan tidak dieksekusi otomatis. Laporan ini mengunci PreHub sebagai "
          "demonstrator decision-support koridor Sumatra, bukan sistem operasional "
          "kritis nasional. Tidak ada pilot bersama BULOG, Bapanas, atau operator armada.")
BOX_S2 = ("Label BULOG adalah fixture. Baris contoh '1.800 Ton Beras BULOG' dan "
          "'Truk Beras BULOG Tebing' menandai data uji alur, bukan bukti integrasi "
          "dengan Perum BULOG. Uji fixture selalu terpisah dari uji data aktual.")
BOX_S3 = ("Solver CPU. Rujukan cuOpt/NVIDIA tinggal sebagai referensi desain. Yang "
          "berjalan adalah Deterministic CPU VRP Solver (NetworkX Dijkstra/A* plus "
          "heuristik 2-Opt): di bawah 150 ms untuk 50 node, nol GPU. Berlaku sejak Fase 37.")
BOX_S4 = ("Fallback TomTom berurutan. Kunci API tersusun primer-cadangan dengan "
          "failover saat 403; latch berbagi mati (False). Jalur normal berlabel live "
          "(is_fallback=False); jalur tanpa kunci atau saat latch aktif berlabel degraded.")
BOX_S5 = ("Operator memegang keputusan. Autentikasi didahulukan (401 sebelum 422); "
          "peran Regulator tanpa hak approvals:write; HOLD hanya penanda UI dan server "
          "tetap menolak (403). Setiap rekomendasi butuh persetujuan operator; "
          "persetujuan tidak menggerakkan armada.")
BOX_S6 = ("Status evaluasi. Acuan N=60 per 26 Okt 2026 (TP 35, FP 0, TN 25, FN 0; "
          "Brier 0,0937) berlaku untuk data uji. Selisih penanda TP 35 vs ekspektasi 34 "
          "masih terbuka. Uji dispatcher (SUS, waktu tugas, error rate, baseline manual) "
          "ditunda.")

insert_log = []


def place(anchor, items, tag):
    insert_after(anchor, items)
    insert_log.append(f"{tag} after P{anchor}: +{len(items)} blok")


# Anchor 263: stub Penggunaan
_stub263 = new_para("Setiap rekomendasi butuh persetujuan operator; HOLD hanya penanda UI "
                    "(lihat Kotak Sinkronisasi 5).",
                    bold_lead="Catatan sinkronisasi: ")
place(263, [_stub263._element], "stub-penggunaan")

# Anchor 255: stub Mockup
_stub255 = new_para("Semua tangkapan adalah uji localhost, bukan produksi "
                    "(lihat Kotak Sinkronisasi 4 soal label live/degraded).",
                    bold_lead="Catatan sinkronisasi: ")
place(255, [_stub255._element], "stub-mockup")

# Anchor 246: caption + Tabel VII.4 + stub Implementasi
cap744 = new_para("Tabel VII.4  Ringkasan Lima Sumber Validasi (kutipan lengkap: Lampiran B)",
                  style="Heading 5")
tab744 = new_table(
    ["Sumber", "Status berkas", "Kutipan satu-dua kalimat"],
    [
        ["MTI", "Final pindaian, 5 halaman; teks tidak terekstrak mesin",
         "Ringkasan status tanpa kutipan verbatim agar tidak fabrikasi; berkas tercatat untuk audit."],
        ["Bahana", "Final pindaian, 5 halaman",
         "Status final; template surat ini dipakai generator Ditmawalumni."],
        ["Bumi Sawita", "Konsep awal, Nomor 001/BSN-EXT/X/2026",
         '"Rekomendasi sistem sebaiknya tetap menjadi bahan pertimbangan operator, '
         'bukan pengganti verifikasi dan kewenangan manusia."'],
        ["Socfin + USU", "Konsultasi draft, belum final",
         'Socfin: "kepastian lokasi armada secara pasti demi faktor keselamatan (safety)"; '
         'data lalu lintas "harus benar-benar valid, terutama kondisi riil di lapangan". '
         'USU: sistem dinilai dari "kemampuannya memotret kondisi nyata di jalur '
         'distribusi darat".'],
        ["RMS", "Wawancara 1 Juni 2026; Ahmad Yusrin, Direktur",
         'Kendala "baru diketahui secara reaktif ketika armada sudah terlanjur di tengah '
         'perjalanan"; koordinasi "masih terbatas pada WhatsApp dan panggilan telepon".'],
    ],
)
stub_impl = new_para("Lima sumber di atas diringkas apa adanya; draft tidak dinaikkan menjadi "
                     "final (lihat Lampiran B serta Kotak Sinkronisasi 1-2 dan 6).",
                     bold_lead="Catatan sinkronisasi: ")
place(246, [cap744._element, tab744._tbl, stub_impl._element], "tabel-VII.4+stub")

# Anchor 221: stub Desain
_stub221 = new_para("Orkestrasi LangGraph adalah pipeline spesialis, bukan kolaborasi otonom; "
                    "solver rute adalah CPU deterministik (lihat Kotak Sinkronisasi 3).",
                    bold_lead="Catatan sinkronisasi: ")
place(221, [_stub221._element], "stub-desain")

# Anchor 166: stub Metodologi + S4,S5,S6 + roadmap
stub_met = new_para("Tiga kotak berikut mengunci fallback data, kendali operator, dan status "
                    "evaluasi untuk BAB ini.", bold_lead="Catatan sinkronisasi: ")
box4 = new_para(BOX_S4, bold_lead="Kotak Sinkronisasi 4 — ")
box5 = new_para(BOX_S5, bold_lead="Kotak Sinkronisasi 5 — ")
box6 = new_para(BOX_S6, bold_lead="Kotak Sinkronisasi 6 — ")
roadmap = new_para("Tutup selisih TP 35-vs-34 lewat keputusan label/batas; kejar tanda tangan "
                   "final Socfin dan USU; uji dispatcher (SUS, waktu tugas, error rate, baseline "
                   "manual); tambah parameter non-alam dan analisis biaya-vs-harga; ukur rugi "
                   "koridor agar urgensi terkuantifikasi.", bold_lead="Peta jalan: ")
place(166, [stub_met._element, box4._element, box5._element, box6._element,
            roadmap._element], "stub-metodologi+box456+roadmap")

# Anchor 142: stub Batasan + caption + tabel perbandingan
stub_bat = new_para("Tabel berikut merangkum enam perbedaan Proposal-Laporan yang dikunci di "
                    "seluruh dokumen.", bold_lead="Catatan sinkronisasi: ")
cap_cmp = new_para("Tabel Perbandingan Proposal-Laporan "
                   "(enam aspek; lihat Kotak Sinkronisasi 1-6)", style="Heading 5")
tab_cmp = new_table(
    ["Aspek", "Proposal", "Laporan ini"],
    [
        ["Batas produk", "Data banyak disimulasikan; keputusan tidak dieksekusi otomatis",
         "Demonstrator decision-support; bukan operasi kritis nasional"],
        ["Label BULOG", "Tidak ada (muncul di dokumen teknis)",
         "Baris fixture; bukan bukti integrasi"],
        ["Optimasi rute", "cuOpt sebagai mesin (dokumen teknis)",
         "CPU solver NetworkX/OR-Tools; nol GPU; Fase 37"],
        ["Data live", "Siap implementasi (dokumen teknis)",
         "TomTom failover berurutan; degraded berlabel"],
        ["Keputusan", "Tombol mitigasi perbarui rute (dokumen teknis)",
         "Operator final; HOLD UI-only, server 403"],
        ["Evaluasi", "Metrik rancangan; 34 unit lulus 100%",
         "N=60 26-Okt; TP 35-vs-34 terbuka; SUS ditunda"],
    ],
)
place(142, [stub_bat._element, cap_cmp._element, tab_cmp._tbl], "stub-batasan+tabel-cmp")

# Anchor 120: stub Tujuan
_stub120 = new_para("Indikator manfaat memakai acuan data uji N=60 per 26 Okt 2026, bukan bukti "
                    "operasi nasional (lihat Kotak Sinkronisasi 6 dan Lampiran A.5 soal selisih "
                    "TP 35-vs-34).",
                    bold_lead="Catatan sinkronisasi: ")
place(120, [_stub120._element], "stub-tujuan")

# Anchor 95: stub Latar + S1,S2,S3
stub_lat = new_para("Tiga kotak berikut mengunci perbedaan Proposal-Laporan untuk BAB ini.",
                    bold_lead="Catatan sinkronisasi: ")
box1 = new_para(BOX_S1, bold_lead="Kotak Sinkronisasi 1 — ")
box2 = new_para(BOX_S2, bold_lead="Kotak Sinkronisasi 2 — ")
box3 = new_para(BOX_S3, bold_lead="Kotak Sinkronisasi 3 — ")
place(95, [stub_lat._element, box1._element, box2._element, box3._element],
      "stub-latar+box123")

# Anchor 324 (paragraf terakhir): 2 butir changelog (append langsung)
c1 = new_para("Sinkronisasi Proposal-Laporan (tugas C): 6 Kotak Sinkronisasi (1-3 di Latar "
               "Belakang; 4-6 di Metodologi), tabel perbandingan enam aspek di Batasan, peta "
               "jalan di Metodologi, dan stub sinkronisasi per BAB. Tidak ada klaim baru; "
               "semua kotak menunjuk ke berkas bukti.", style="List Paragraph")
c2 = new_para("Validasi (tugas C): kutipan Bumi Sawita soal rekomendasi sebagai bahan "
               "pertimbangan operator; kutipan Socfin soal kondisi riil lapangan; kutipan USU "
               "soal kondisi nyata jalur darat; kutipan RMS soal reaktif; Tabel VII.4 ringkasan "
               "lima sumber di Implementasi. SDT Mendeley tidak diubah.",
               style="List Paragraph")
insert_log.append("changelog: +2 butir di akhir (List Paragraph)")

d.save(str(SRC))

print("SHA_AFTER=" + sha(SRC))
after = pkg_counts(SRC)
print("PKG_AFTER=" + str(after))
print(f"DOC_AFTER paras={len(d.paragraphs)} tables={len(d.tables)} shapes={len(d.inline_shapes)}")
print("EDITED_RUN_PARAS=" + str(sorted(edited)))
for line in insert_log:
    print("INSERT " + line)
print("SDT_OK=" + str(before["sdt"] == after["sdt"]))
print("MENDELEY_OK=" + str(before["mendeley_cit"] == after["mendeley_cit"]
                            and before["mendeley_bib"] == after["mendeley_bib"]))
