"""Rewrite BAB I-V Laporan-PreHub preserving Mendeley SDT, images, tables, styles."""
import hashlib, datetime, shutil, pathlib
from docx import Document
from docx.oxml.ns import qn
from lxml import etree

SRC = pathlib.Path("Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx")

def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()

sha_before = sha(SRC)
print(f"SHA_BEFORE={sha_before}")

ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
backup = SRC.parent / f"Laporan-PreHub-GEMASTIK19.backup-{ts}.docx"
shutil.copy2(SRC, backup)
print(f"BACKUP={backup}")

d = Document(str(SRC))

def count_sdt():
    import zipfile
    z = zipfile.ZipFile(str(SRC))
    xml = z.read("word/document.xml").decode("utf8")
    return xml.count("<w:sdt"), xml.count("MENDELEY_CITATION_v3"), xml.count("BIBLIOGRAPHY")

# snapshot before
n_para_before = len(d.paragraphs)
n_tables_before = len(d.tables)
n_img_before = len(d.inline_shapes)
print(f"BEFORE paras={n_para_before} tables={n_tables_before} inline_shapes={n_img_before}")

def set_text_safe(idx, new_text):
    para = d.paragraphs[idx]
    runs = para.runs
    if not runs:
        para.add_run(new_text)
        return
    # preserve first run formatting
    runs[0].text = new_text
    for r in runs[1:]:
        r.text = ""
    # SDT elements (w:sdt) are siblings of w:r, untouched by run edits

REWRITES = {
93: ("Kebutuhan itu tampak pada banjir dan longsor Sumatra akhir 2025. BNPB mencatat jalan dan jembatan rusak membuat sejumlah wilayah terisolasi, sehingga logistik berjalan dengan kombinasi darat, laut, dan udara. Peristiwa ini menunjukkan akses jalan berubah dalam hitungan jam dan operator perlu data aktual plus alternatif rute yang siap banding."),
95: ("Kondisi itu menciptakan kebutuhan perangkat lunak yang mengubah data multisumber menjadi konteks operasional. PreHub menjawab kebutuhan itu sebagai demonstrator decision-support untuk distribusi pangan Sumatra. Sistem menggabungkan cuaca, lalu lintas, perjalanan, dan kejadian publik; menandai indikasi gangguan; memeriksa bukti dari sumber relevan; memetakan dampak ke 12 titik pantau TomTom dari Belawan sampai Bakauheni; dan menyajikan perbandingan Continue, Reroute, atau Hold/Delay. Operator memegang keputusan akhir; PreHub menyajikan dasar pertimbangan."),
99: ("Membangun visibilitas operasional yang berpotensi dipantau operator dengan menggabungkan cuaca, lalu lintas, perjalanan, dan kejadian publik ke satu konteks spasial-temporal."),
100: ("Menandai indikasi gangguan lebih awal dengan membaca perubahan kondisi yang berpotensi mengganggu 12 titik pantau sebelum dampak meluas."),
101: ("Menguji keandalan peringatan lewat validasi bukti: kualitas, kebaruan, kesesuaian spasial-temporal, dan independensi sumber."),
102: ("Menerjemahkan indikasi menjadi estimasi dampak: titik terdampak, selisih ETA, eksposur perjalanan, dan konsekuensi operasi."),
103: ("Menyajikan alternatif yang dapat dibandingkan: Continue, Reroute, atau Hold/Delay sesuai kondisi, kendala, dan risiko."),
104: ("Menjaga keputusan dalam kendali operator lewat Evidence Chain yang merangkai sumber, analisis, penilaian risiko, dan rekomendasi."),
105: ("Mengukur efektivitas secara kuantitatif dan end-to-end. Acuan N=60 per 26 Okt 2026 mencatat TP 35, FP 0, TN 25, FN 0, presisi 1,0, recall 1,0, F1 1,0, Brier 0,0937. Satu pemeriksaan penanda masih merah (TP 35 vs ekspektasi 34) dan menunggu keputusan label/batas sebelum diklaim final."),
109: ("PreHub berpotensi mengurangi kerja manual dengan menempatkan kondisi distribusi, bukti, dan pilihan mitigasi dalam satu alur. Operator memeriksa dasar peringatan dan membandingkan opsi tanpa melepas keputusan akhir."),
111: ("PreHub berpotensi mendukung tindakan proaktif lewat deteksi dini dan pantauan risiko pada 12 titik. Gabungan informasi ini berpotensi memperbaiki koordinasi dan efisiensi, dengan catatan infrastruktur dan kualitas data masih membatasi."),
113: ("Sistem ini berpotensi memperkuat adaptasi distribusi pangan: operator membandingkan rute alternatif atau menunda keberangkatan saat hambatan muncul. Respons adaptif seperti ini berpotensi menjaga pasokan, bila data lapangan tersedia."),
115: ("PreHub mengubah data terpisah menjadi konteks keputusan terstruktur. Evidence Chain merangkai indikasi awal, validasi, dan rekomendasi sehingga operator menelusuri dasar setiap saran."),
117: ("PreHub mencatat peringatan, keputusan ACCEPT/REJECT/OVERRIDE, dan hasil lapangan T+12h/T+24h sebagai bahan evaluasi. Catatan ini memungkinkan tim menilai perubahan kualitas dari data uji, bukan dari kesan."),
119: ("Tim menilai manfaat lewat indikator yang merangkai kemampuan perangkat lunak dengan hasil operasi yang diharapkan. Angka acuan 26 Okt 2026 (N=60, TP 35, FP 0, TN 25, FN 0, presisi/recall/F1 1,0, Brier 0,0937) berlaku untuk data uji, bukan bukti operasi nasional. Satu selisih penanda (TP 35 vs 34) masih terbuka dan menunggu keputusan label."),
122: ("PreHub berjalan sebagai demonstrator decision-support untuk mitigasi gangguan distribusi pangan pada koridor Sumatra. Sistem ini belum memenuhi syarat operasi kritis nasional. Pengguna utama: Operations Coordinator atau Logistics Dispatcher. Batasan fungsi, data, wilayah, dan otomasi di bawah ini menentukan apa yang dapat diuji dan diukur."),
124: ("PreHub mencakup integrasi multisumber, pantauan 12 titik, deteksi indikasi, validasi bukti, analisis dampak perjalanan, perbandingan mitigasi, dan penyajian rekomendasi. Pilihan yang dibandingkan: Continue, Reroute, Hold/Delay."),
130: ("PreHub memakai data terstruktur (cuaca BMKG, lalu lintas TomTom, posisi armada bila tersedia) dan tak-terstruktur (berita/OSINT publik). Setiap sumber berbeda cakupan, frekuensi, kelengkapan, dan reliabilitas."),
131: ("Ketika sumber telat, hilang, atau bertentangan, sistem menurunkan keyakinan, menahan status sebagai indikasi, atau meminta verifikasi operator. Jalur fallback tetap tersedia tetapi tidak aktif saat data live tersedia: kunci TomTom tersusun berurutan dengan latch berbagi mati (False), dan penanda is_fallback bernilai False pada jalur normal."),
134: ("Data yang belum tersedia langsung dapat diwakili fixture atau simulasi untuk menguji alur. Label contoh seperti \u20181.800 Ton Beras BULOG\u2019 dan \u2018Truk Beras BULOG Tebing\u2019 menandai baris fixture, bukan bukti integrasi dengan Perum BULOG. Setiap uji memakai fixture selalu terpisah dari uji data aktual."),
135: ("Tim tidak memakai fixture untuk mengklaim akses real-time ke seluruh lapangan. Laporan memisahkan hasil uji fixture dari hasil uji data aktual agar pembaca tidak salah tafsir."),
137: ("Pengembangan dan validasi awal berfokus pada 12 titik pantau Trans-Sumatra: Belawan, Tanjung Mulia, Binjai, Tebing Tinggi, Pematangsiantar, Pekanbaru, Dumai, Padang By Pass, Bukittinggi, Palembang Kramasan, Terbanggi Besar, Bakauheni. Cakupan ini adalah lingkungan uji, bukan klaim kesiapan nasional."),
138: ("Skenario uji mencakup cuaca, anomali lalu lintas, gangguan infrastruktur, dan kejadian lokal dari sumber publik yang memengaruhi akses jalan. PreHub tidak mengelola produksi, pergudangan, perdagangan, harga, atau kebijakan pangan nasional."),
140: ("PreHub tidak mengeksekusi tindakan eksternal otomatis. Sistem tidak mengubah rute kendaraan, tidak mengirim instruksi ke pengemudi, tidak mengendalikan kendaraan, dan tidak mengintervensi infrastruktur. Operator menyetujui atau menolak setiap rekomendasi; persetujuan tidak menggerakkan armada sendiri."),
142: ("Dengan batas itu, satu fungsi inti yang diuji end-to-end adalah: sistem menandai gangguan, memeriksa bukti, memperkirakan dampak, dan membandingkan mitigasi untuk mendukung keputusan operator."),
144: ("Tim membangun PreHub secara incremental berfase dengan alur GSD: bahas, rencanakan, kerjakan, verifikasi per fase dan catat di .planning. Cara ini cocok untuk sistem data dan AI karena kebutuhan, kualitas data, konfigurasi model, dan hasil analitik berubah setelah diuji. Setiap increment menambah fungsi yang dapat dijalankan; setiap iterasi memakai hasil uji sebagai dasar perbaikan. Pola ini mengikuti praktik sistem ML yang menjalankan eksperimen, validasi, pembangunan pipeline, dan produksi sebagai siklus berulang."),
145: ("Pengerjaan berjalan dalam lima tahap: analisis kebutuhan, perancangan solusi, implementasi incremental, validasi dan pengujian, serta evaluasi pengguna dan iterasi."),
153: ("Implementasi berjalan bertahap sesuai prioritas fungsi inti. Increment awal menangani akuisisi dan normalisasi data, lalu berlanjut ke deteksi dan validasi, analisis dampak, rekomendasi mitigasi, dan integrasi antarmuka."),
157: ("Setiap increment melewati pengujian sebelum bergabung ke sistem. Pengujian berjalan tiga tingkat: komponen, integrasi, dan skenario end-to-end dengan data uji N=60."),
158: ("Pertama, component testing memeriksa fungsi tunggal: validasi data, API, pemrosesan spasial-temporal, ekstraksi informasi, dan modul analitik."),
160: ("Ketiga, scenario-based testing menjalankan alur deteksi, validasi, analisis dampak, dan rekomendasi pada 9 drill pilot (FR20-01 sampai FR20-09) plus skenario gangguan yang ditetapkan. Uji ini menilai apakah alur berjalan konsisten."),
161: ("Tim mengukur dengan metrik sesuai karakter komponen: precision, recall, F1, false-positive rate, detection latency, Brier Score dan analisis kalibrasi, selisih ETA prediksi vs aktual, kelayakan rute, constraint violations, waktu komputasi, serta task completion, error rate, dan waktu keputusan. Matriks uji mencatat 137 kasus dari FR-01 sampai FR-20."),
164: ("Setelah alur end-to-end berjalan, tim menguji pemakaian lewat tugas operator: membaca kondisi, menemukan bukti, mengidentifikasi dampak, membandingkan alternatif, dan menetapkan tindakan. Playwright menjalankan uji ini terhadap localhost:3000 dengan server lokal, sehingga tangkapan layar dan angka hanya berlaku untuk lingkungan uji, bukan produksi."),
166: ("Siklus berulang sampai increment memenuhi kriteria fungsi dan evaluasi. Setiap penambahan fungsi menghasilkan perangkat lunak yang dapat dijalankan, diuji, diukur, dan diperbaiki dari bukti."),
179: ("PreHub menggabungkan data terstruktur (cuaca BMKG, lalu lintas TomTom, posisi armada) dan tak-terstruktur (berita/OSINT). Sebelum analisis, sistem menormalisasi, menyinkronkan, dan menyelaraskan data ke 12 titik distribusi dengan menyertakan metadata. Agen Intelligence mengubah teks tak-terstruktur menjadi struktur lokasi, waktu, jenis gangguan, dan bukti."),
180: ("Untuk prakiraan cuaca, PreHub memakai Open-Meteo (model numerik ECMWF/GFS) yang dipadukan dengan peringatan resmi BMKG, tanpa GPU. Sinyal cuaca dipetakan ke titik distribusi. Seluruh data terintegrasi diolah menjadi objek bukti tiga lapis: data mentah, bukti terstruktur, dan konteks operasional. Pemisahan ini memungkinkan tim menilai kualitas sumber dan hasil analisis secara independen, dan mencegah data belum lengkap langsung menentukan keputusan."),
182: ("PreHub memisahkan indikasi dari kejadian tervalidasi. Setiap agen mengeluarkan sinyal sesuai domain: risiko cuaca, anomali lalu lintas, atau laporan kejadian. Setiap sinyal membawa metadata sumber, waktu ambil, lokasi, jenis bukti, kualitas data, dan keyakinan sesuai karakter sumber. Consensus Engine menilai apakah bukti cukup kuat menjadi kejadian tervalidasi."),
183: ("Validasi tidak menghitung jumlah sumber secara sederhana karena sumber dapat bergantung satu sama lain. Contoh: BMKG dan Open-Meteo sama-sama membaca atmosfer sehingga tidak dihitung sebagai dua bukti lapangan independen. Karena itu PreHub mengelompokkan bukti per domain dan sumber, lalu menilai independensi, kualitas, kebaruan, kesesuaian spasial, dan konsistensi. Bukti atmosfer, lalu lintas, dan laporan lapangan yang saling konsisten memiliki bobot lebih kuat daripada beberapa keluaran model dari fenomena sama."),
187: ("Probabilitas gangguan menyatakan peluang kondisi teridentifikasi benar-benar mengganggu operasi pada titik atau perjalanan yang dipantau. Nilai ini tidak diambil langsung dari confidence model bahasa maupun jumlah sumber. Alur konsep: Evidence, lalu Validation, lalu Disruption Probability."),
199: ("Pembagian ini dipakai karena setiap domain memiliki sumber, metode, dan keluaran berbeda. Agen tidak menetapkan keputusan final sendiri; setiap agen mengeluarkan structured output untuk tahap berikut."),
203: ("Dalam PreHub, LangGraph berperan sebagai orkestrator pipeline spesialis, bukan sumber kebenaran dan bukan kolaborasi otonom. Validasi evidence, hitungan metrik, constraint routing, dan keputusan akhir tetap pada lapisan yang dapat diperiksa."),
205: ("Setelah gangguan tervalidasi dan relevan dengan perjalanan, PreHub memetakan hubungan kejadian dengan operasi terdampak: lokasi, titik terdampak, selisih ETA, kendaraan/pengiriman terekspos, dan alternatif yang tersedia."),
206: ("Untuk alternatif rute, PreHub memakai Deterministic CPU VRP Solver (NetworkX Dijkstra/A* plus heuristik 2-Opt) sejak Fase 37, tanpa GPU. Masalah rute memakai info lingkungan perjalanan, armada, tugas, waktu, dan kendala operasi. Solver menangani Vehicle Routing Problem dengan kendala kapasitas, time windows, prioritas, dan batas operasi dalam <150 ms untuk 50 node."),
211: ("Operator memilih tindakan dari info sistem dan konteks lapangan. Dengan begitu, CPU solver berperan sebagai mesin optimasi, sedangkan PreHub berperan sebagai lapisan keputusan yang merangkai hasil optimasi dengan bukti dan konteks operasi."),
213: ("PreHub menyajikan Evidence Chain yang merangkai sumber, analisis, validasi, dan rekomendasi sehingga operator menelusuri dasar keputusan. Fitur ini menampilkan lokasi, waktu, keyakinan, dan pemicu peringatan yang relevan. Saat info bertentangan atau data terbatas, sistem menurunkan keyakinan atau meminta verifikasi operator agar tidak memicu saran tanpa bukti. Operator dapat mengoreksi rekomendasi; setiap tindakan tercatat untuk audit. Desain ini mengikuti panduan transparansi dan interpretabilitas NIST AI RMF."),
215: ("Tim mengevaluasi PreHub tiga tingkat: komponen, integrasi, dan end-to-end. Setiap modul memiliki karakter berbeda sehingga satu metrik tidak cukup. Level komponen menguji fungsi tiap modul: akurasi dan latensi deteksi, ketepatan ekstraksi OSINT, Brier Score probabilistik, dan efisiensi komputasi rute CPU."),
216: ("Level integrasi menguji aliran data dari olah awal sampai rekomendasi, termasuk ketahanan saat data telat atau bertentangan. Evaluasi end-to-end memakai skenario logistik dan 9 drill pilot untuk menguji kinerja menyeluruh dan dampak ke keputusan pengguna. Hasil uji menjadi dasar iterasi untuk memperbaiki kesalahan, menyesuaikan parameter, dan menaikkan kinerja."),
218: ("PreHub berjalan sebagai decision-support closed-loop dari pantauan sampai evaluasi. Tahap awal menormalisasi data multisumber terstruktur dan tak-terstruktur menjadi representasi bukti. Modul spesifik (cuaca, lalu lintas, OSINT) menganalisis bukti, lalu Consensus Engine memvalidasi berdasar konsistensi, kebaruan, dan independensi. Sistem lalu mengukur probabilitas dan dampak menjadi penilaian risiko tanpa bergantung pada satu nilai keyakinan."),
221: ("Bila risiko menuntut tindakan, modul optimasi CPU menyusun respons: lanjutkan, alihkan, atau tunda keberangkatan. Sistem menyajikan pilihan lewat Evidence Chain agar dasarnya terlacak. Operator memegang keputusan akhir; setiap tindakan dan hasilnya tercatat untuk evaluasi. Catatan ini dipakai untuk menyempurnakan parameter, ambang, dan analitik sehingga siklus deteksi sampai perbaikan berjalan berlanjut."),
}

edited = []
for idx, (new_text,) in [(k, (v,)) for k, v in REWRITES.items()]:
    old = d.paragraphs[idx].text[:80]
    set_text_safe(idx, new_text)
    edited.append(idx)

# Table 3 honesty updates (R13, R14) — preserve style, only cell text
t3 = d.tables[3]
# R13
c = t3.rows[13].cells
c[1].paragraphs[0].runs[0].text = "Fixture berlabel"
# keep remaining runs cleared
for r in c[1].paragraphs[0].runs[1:]:
    r.text = ""
c[2].paragraphs[0].runs[0].text = "Baseline 45-unit plus label contoh BULOG untuk uji alur; data GPS/IoT riil hanya lewat webhook TMS."
for r in c[2].paragraphs[0].runs[1:]:
    r.text = ""
# R14
c = t3.rows[14].cells
c[1].paragraphs[0].runs[0].text = "Sudah diimplementasi (CPU)"
for r in c[1].paragraphs[0].runs[1:]:
    r.text = ""
c[2].paragraphs[0].runs[0].text = "Solver CPU deterministik NetworkX Dijkstra/A* plus OR-Tools, <150 ms untuk 50 node, nol GPU."
for r in c[2].paragraphs[0].runs[1:]:
    r.text = ""

# Footnote once: PreHub canonical + peta-nadi alias on P88
from docx.oxml import OxmlElement
# 1. ensure footnotes.xml has id 1
import zipfile
# Work via document XML manipulation before save: python-docx has no footnote API,
# so inject via lxml on the in-memory document part + footnotes part after save? 
# Instead: save first, then patch the .docx zip (document.xml + footnotes.xml).
d.save(str(SRC))
print(f"SAVED interim paras={len(d.paragraphs)} tables={len(d.tables)}")

# Patch zip for footnote
FOOTNOTE_TEXT = "PreHub adalah nama produk; peta-nadi adalah nama layanan deploy di Render (render.yaml:3, APP_URL https://peta-nadi.onrender.com)."
zpath = str(SRC)
z = zipfile.ZipFile(zpath, "a")
try:
    fn_xml = z.read("word/footnotes.xml")
except KeyError:
    fn_xml = None
print("footnotes exists:", fn_xml is not None)
z.close()

# Re-open with lxml
import zipfile as zf
zin = zf.ZipFile(zpath, "r")
doc_xml = zin.read("word/document.xml")
fn_xml = zin.read("word/footnotes.xml")
zin.close()

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
doc_root = etree.fromstring(doc_xml)
fn_root = etree.fromstring(fn_xml)

# check existing footnote ids
ids = [int(f.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id")) for f in fn_root.findall("w:footnote", NS) if f.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id").lstrip("-").isdigit()]
print("existing footnote ids:", ids)
new_id = 1
while new_id in ids:
    new_id += 1
print("new footnote id:", new_id)

# create footnote element
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
def el(tag):
    return etree.Element(f"{{{W}}}{tag}")

fn = el("footnote")
fn.set(f"{{{W}}}id", str(new_id))
p = el("p")
pPr = el("pPr")
p.append(pPr)
r = el("r")
rPr = el("rPr")
sz = el("sz"); sz.set(f"{{{W}}}val", "18")
rPr.append(sz)
r.append(rPr)
t = el("t")
t.text = FOOTNOTE_TEXT
# preserve space
t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
r.append(t)
p.append(r)
fn.append(p)
fn_root.append(fn)

# add footnoteReference to P88 paragraph (document body paras index 88).
# Find body paragraphs: word/document.xml w:body/w:p list. python-docx paras[88] corresponds to body p index?
# Safer: find p whose text starts with PreHub title.
body = doc_root.find("w:body", NS)
ps = body.findall("w:p", NS)
print("body p count:", len(ps))
# map: python-docx paragraphs include only body p (excluding tables?). Tables contain their own p. 
# Our target P88 is body p; find by text.
target = None
for p_el in ps:
    txt = "".join(t_el.text for t_el in p_el.findall(".//w:t", NS) if t_el.text)
    if txt.startswith("PreHub: Sistem Peringatan"):
        target = p_el
        break
print("target found:", target is not None)
if target is not None:
    # check if already has footnoteReference
    existing_refs = target.findall(".//w:footnoteReference", NS)
    print("existing refs:", len(existing_refs))
    if len(existing_refs) == 0:
        # append new run with footnoteReference at end of paragraph
        r2 = el("r")
        rPr2 = el("rPr")
        sz2 = el("sz"); sz2.set(f"{{{W}}}val", "18")
        rPr2.append(sz2)
        r2.append(rPr2)
        fr = el("footnoteReference")
        fr.set(f"{{{W}}}id", str(new_id))
        r2.append(fr)
        target.append(r2)
        print("footnoteReference added")
    else:
        print("footnote already present, skip")

# write back
new_doc = etree.tostring(doc_root, xml_declaration=True, encoding="UTF-8", standalone=True)
new_fn = etree.tostring(fn_root, xml_declaration=True, encoding="UTF-8", standalone=True)
# rewrite zip
import io, os
tmp = zpath + ".tmp"
zin = zf.ZipFile(zpath, "r")
zout = zf.ZipFile(tmp, "w", compression=zf.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if item.filename == "word/document.xml":
        data = new_doc
    elif item.filename == "word/footnotes.xml":
        data = new_fn
    zout.writestr(item, data)
zin.close(); zout.close()
os.replace(tmp, zpath)
print("FOOTNOTE patched")

sha_after = sha(SRC)
print(f"SHA_AFTER={sha_after}")
print(f"EDITED_PARAS={sorted(edited)}")
print(f"TABLE_CELLS=3:R13C1,R13C2,R14C1,R14C2")
