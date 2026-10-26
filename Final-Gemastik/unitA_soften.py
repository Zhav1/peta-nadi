"""Unit A: soften overly strict wording to Proposal voice, preserve facts + Mendeley SDT.
Targets (0-indexed python-docx paras):
 P93 urgency, P99-104 tujuan, P109,111,113,115,117 manfaat, P122,124,142,187,218 colons,
 P95,144,211 throat, P99-104/109-117/224-236 rhythm, P135,138,140,238,240 strict lists,
 puffery caps mapped to 111,115,224,236 (P338+ exceed doc length 323/447).
Preserves: numbers/dates/file:line, operator agency, SDT, tables, images, styles.
Italics foreign terms per EYD V via run-level w:i.
"""
import shutil, datetime, pathlib, hashlib, zipfile
from docx import Document
from lxml import etree

SRC = pathlib.Path("Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx")
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
def qn(tag): return f"{{{W}}}{tag}"

def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
print(f"SHA_BEFORE={sha(SRC)}")
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
backup = SRC.parent / f"Laporan-PreHub-GEMASTIK19.backup-unitA-{ts}.docx"
shutil.copy2(SRC, backup)
print(f"BACKUP={backup}")

d = Document(str(SRC))
n_para_before = len(d.paragraphs); n_tables_before = len(d.tables); n_img_before = len(d.inline_shapes)
z0 = zipfile.ZipFile(str(SRC)); xml0 = z0.read("word/document.xml").decode("utf8")
sdt_before = xml0.count("<w:sdt"); mend_before = xml0.count("MENDELEY"); z0.close()
print(f"BEFORE paras={n_para_before} tables={n_tables_before} imgs={n_img_before} sdt={sdt_before} mendeley={mend_before}")

FOREIGN = [
    "Operations Coordinator / Logistics Dispatcher",
    "Operations Coordinator",
    "Logistics Dispatcher",
    "Transportation Management System",
    "Enterprise Resource Planning",
    "supply chain visibility",
    "human-in-the-loop",
    "decision-support",
    "decision support",
    "Evidence Chain",
    "Hold/Delay",
    "Continue",
    "Reroute",
]
# longest first for correct splitting
FOREIGN_SORTED = sorted(FOREIGN, key=len, reverse=True)

def split_foreign(text):
    """Split text into (segment, is_foreign) preserving case-sensitive matches."""
    out = []
    i = 0
    while i < len(text):
        hit = None
        for term in FOREIGN_SORTED:
            if text.startswith(term, i):
                # word-boundary guard for short labels: require non-alnum or end on both sides
                before = text[i-1] if i > 0 else " "
                after = text[i+len(term)] if i+len(term) < len(text) else " "
                if term in ("Continue", "Reroute"):
                    if (before.isalnum() or before == "_") or (after.isalnum() or after == "_"):
                        continue
                hit = term
                break
        if hit:
            out.append((hit, True))
            i += len(hit)
        else:
            # accumulate until next hit
            j = i + 1
            while j <= len(text):
                found = any(text.startswith(t, j) for t in FOREIGN_SORTED)
                if found:
                    break
                j += 1
            out.append((text[i:j], False))
            i = j
    return out

def set_para(idx, new_text):
    para = d.paragraphs[idx]
    el = para._element
    # capture base rPr from first w:r
    first_r = el.find(qn("r"), NS) if hasattr(el, "find") else None
    # lxml element API: use find with namespaces
    try:
        first_r = el.find("w:r", NS)
    except Exception:
        first_r = None
    base_rpr_xml = None
    if first_r is not None:
        rpr = first_r.find("w:rPr", NS)
        if rpr is not None:
            base_rpr_xml = etree.tostring(rpr)
    # remove old runs/proofErr/hyperlink/bookmarks (keep pPr + sdt)
    for child in list(el):
        if child.tag in (qn("r"), qn("proofErr"), qn("hyperlink"), qn("bookmarkStart"), qn("bookmarkEnd")):
            el.remove(child)
    sdts = el.findall("w:sdt", NS)
    def make_run(text, italic):
        r = etree.Element(qn("r"))
        # base formatting
        if base_rpr_xml is not None:
            try:
                r.append(etree.fromstring(base_rpr_xml))
                rpr_new = r.find(qn("i"), NS)
            except Exception:
                pass
        # ensure rPr exists
        rpr = r.find(qn("rPr"), NS)
        if rpr is None:
            rpr = etree.Element(qn("rPr"))
            r.insert(0, rpr)
        if italic:
            if rpr.find(qn("i"), NS) is None:
                etree.SubElement(rpr, qn("i"))
        t = etree.SubElement(r, qn("t"))
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = text
        return r
    segs = split_foreign(new_text)
    runs = [make_run(s, it) for s, it in segs if s != ""]
    if sdts:
        idx_first = list(el).index(sdts[0])
        for k, r in enumerate(runs):
            el.insert(idx_first + k, r)
    else:
        for r in runs:
            el.append(r)

EDITS = {
93: "Kebutuhan itu tampak pada banjir dan longsor Sumatra akhir 2025. BNPB mencatat jalan dan jembatan rusak membuat sejumlah wilayah terisolasi, sehingga logistik berjalan dengan kombinasi darat, laut, dan udara. Peristiwa ini memberi contoh bagaimana akses jalan dapat berubah dalam hitungan jam, sehingga operator terbantu bila tersedia data aktual dan alternatif rute yang dapat dibandingkan.",
95: "PreHub dirancang sebagai demonstrator decision-support untuk distribusi pangan Sumatra yang merangkai data multisumber menjadi konteks operasional. Sistem menggabungkan cuaca, lalu lintas, perjalanan, dan kejadian publik; menandai indikasi gangguan; memeriksa bukti dari sumber relevan; memetakan dampak ke 12 titik pantau TomTom dari Belawan sampai Bakauheni; dan menyajikan perbandingan Continue, Reroute, atau Hold/Delay. Operator memegang keputusan akhir; PreHub menyajikan dasar pertimbangan.",
99: "Membantu operator memantau visibilitas operasional dengan menggabungkan cuaca, lalu lintas, perjalanan, dan kejadian publik ke satu konteks spasial-temporal.",
100: "Menandai indikasi gangguan lebih awal dengan membaca perubahan kondisi yang dapat mengganggu 12 titik pantau sebelum dampak meluas.",
101: "Menguji keandalan peringatan lewat validasi bukti yang mencakup kualitas, kebaruan, kesesuaian spasial-temporal, dan independensi sumber.",
102: "Menerjemahkan indikasi menjadi estimasi dampak yang mencakup titik terdampak, selisih ETA, eksposur perjalanan, dan konsekuensi operasi.",
103: "Menyajikan alternatif yang dapat dibandingkan, yaitu Continue, Reroute, atau Hold/Delay, sesuai kondisi, kendala, dan risiko.",
104: "Keputusan tetap di tangan operator; Evidence Chain merangkai sumber, analisis, penilaian risiko, dan rekomendasi sebagai dasar pertimbangan.",
109: "PreHub dirancang untuk mengurangi kerja manual dengan menempatkan kondisi distribusi, bukti, dan pilihan mitigasi dalam satu alur. Operator memeriksa dasar peringatan dan membandingkan opsi tanpa melepas keputusan akhir.",
111: "PreHub dapat mendukung tindakan proaktif lewat deteksi dini dan pantauan risiko pada 12 titik. Gabungan informasi ini membantu koordinasi, dengan catatan infrastruktur dan kualitas data masih membatasi.",
113: "Sistem ini diharapkan memperkuat adaptasi distribusi pangan, di mana operator membandingkan rute alternatif atau menunda keberangkatan saat hambatan muncul. Respons adaptif seperti ini dapat membantu menjaga pasokan, bila data lapangan tersedia.",
115: "PreHub merangkai data terpisah menjadi konteks keputusan terstruktur. Evidence Chain merangkai indikasi awal, validasi, dan rekomendasi sehingga operator dapat menelusuri dasar setiap saran.",
117: "PreHub mencatat peringatan, keputusan ACCEPT/REJECT/OVERRIDE, dan hasil lapangan T+12h/T+24h sebagai bahan evaluasi. Catatan ini membantu tim menilai perubahan kualitas dari data uji, bukan dari kesan.",
122: "PreHub berjalan sebagai demonstrator decision-support untuk mitigasi gangguan distribusi pangan pada koridor Sumatra. Sistem ini belum memenuhi syarat operasi kritis nasional. Pengguna utama adalah Operations Coordinator atau Logistics Dispatcher. Batasan fungsi, data, wilayah, dan otomasi di bawah ini menentukan apa yang dapat diuji dan diukur.",
124: "PreHub mencakup integrasi multisumber, pantauan 12 titik, deteksi indikasi, validasi bukti, analisis dampak perjalanan, perbandingan mitigasi, dan penyajian rekomendasi. Pilihan yang dibandingkan adalah Continue, Reroute, dan Hold/Delay.",
135: "Tim tidak memakai fixture sebagai klaim akses real-time; laporan memisahkan hasil uji fixture dari hasil uji data aktual agar pembaca tidak salah tafsir.",
138: "Skenario uji mencakup cuaca, anomali lalu lintas, gangguan infrastruktur, dan kejadian lokal dari sumber publik yang memengaruhi akses jalan. PreHub tidak mengelola rantai hulu-hilir di luar akses jalan, seperti produksi hingga kebijakan pangan nasional.",
140: "PreHub tidak mengeksekusi tindakan eksternal otomatis, seperti mengubah rute kendaraan, mengirim instruksi ke pengemudi, mengendalikan kendaraan, atau mengintervensi infrastruktur. Operator menyetujui atau menolak setiap rekomendasi; persetujuan tidak menggerakkan armada sendiri.",
142: "Dengan batas itu, satu fungsi inti yang diuji end-to-end adalah sistem menandai gangguan, memeriksa bukti, memperkirakan dampak, dan membandingkan mitigasi untuk mendukung keputusan operator.",
144: "Tim membangun PreHub secara incremental berfase dengan alur GSD, yaitu bahas, rencanakan, kerjakan, verifikasi per fase dan catat di .planning. Kebutuhan, kualitas data, konfigurasi model, dan hasil analitik PreHub berubah setelah diuji, sehingga setiap increment menambah fungsi yang dapat dijalankan dan setiap iterasi memakai hasil uji sebagai dasar perbaikan. Pola ini mengikuti praktik sistem ML yang menjalankan eksperimen, validasi, pembangunan pipeline, dan produksi sebagai siklus berulang.",
187: "Probabilitas gangguan menilai peluang kondisi tersebut benar-benar mengganggu koridor yang diamati. Nilai tidak diambil dari confidence model bahasa atau jumlah sumber. Alur konseptualnya adalah Evidence, lalu Validation, lalu Disruption Probability. Rumus independensi probabilistik yang dipakai: P_disruption(s) = 1 - prod_k (1 - w_k(t,d) * p_k(s)) untuk k di {W,T,I,E} (agents/tools/consensus_gate.py:3-4). Bobot dasar saat anomali aktif: W 0,35 / T 0,25 / I 0,20 / E 0,20; saat tidak aktif: W 0,4375 / T 0,3125 / I 0,25 / E 0,0 (agents/tools/consensus_gate.py:29-44). Tiap bobot dikali peluruhan temporal e^(-0,05 * jam) dan spasial e^(-d / 25 km) (agents/tools/consensus_gate.py:49-50,81-88). Suku per kanal: term_k = 1 - w_k * p_k; peluang non-deteksi = term_W * term_T * term_I * term_E; P mentah = 1 - peluang non-deteksi (agents/tools/consensus_gate.py:396-403).",
211: "Operator memilih berdasar informasi sistem dan konteks lapangan. Solver CPU berfungsi sebagai mesin optimasi model; PreHub adalah lapisan keputusan yang menghubungkan hasil optimasi dengan bukti dan konteks. Tidak ada eksekusi otomatis; tombol mitigasi membuka persetujuan HITL yang dicatat di SQLite (backend/app/db/local_storage.py:370; backend/app/routers/fleet_ingest_router.py:266-286).",
218: "PreHub adalah decision-support closed-loop dari pantau hingga evaluasi. Data multisumber dinormalisasi menjadi bukti; modul cuaca, lalu lintas, dan OSINT menganalisis; Consensus Engine memvalidasi berdasar konsistensi, kebaruan, dan independensi. Sistem mengukur probabilitas dan dampak tanpa bertumpu pada satu keyakinan. Gate promosi memakai confidence >= 0,85 dan >=2 sensor independen plus koroborasi fisik atau bypass simulasi (agents/tools/consensus_gate.py:482-489). Klaim tak terkoroborasi dibatasi <=0,50; bukti simulasi didiskon 0,90, bukan ditulis ulang menjadi kepastian (agents/tools/consensus_gate.py:473-480).",
224: "PreHub adalah aplikasi web modular dengan Next.js di frontend, FastAPI di backend, dan PostgreSQL dengan PostGIS untuk spasial. Nama produk adalah PreHub dan alias deploy adalah peta-nadi (render.yaml:3; render.yaml:69-72). URL publik dan CORS memakai https://peta-nadi.onrender.com, sedangkan SOP lokal memakai http://localhost:3000 dan http://localhost:8000. Struktur modular memungkinkan uji komponen terpisah dan penggantian fixture simulasi dengan sumber operasional bertahap tanpa mengganggu antarmuka. Status operasional adalah demonstrator decision-support untuk koridor pangan Sumatra, bukan sistem operasional kritis nasional; belum ada pilot bersama BULOG, Bapanas, atau operator armada (Final-Gemastik/last-judgement.txt:11). Label BULOG di kode adalah fixture (backend/app/services/telemetry_service.py:247; backend/app/routers/fleet_ingest_router.py:49), bukan bukti integrasi.",
228: "Tahap ingestion menormalisasi, memvalidasi, mendedup, geocode, dan memetakan H3, lalu event diteruskan lewat event stream dengan metadata. Probe live 26-Okt memakai scripts/check_tomtom.py:40-89 untuk mask kunci, cek Redis, status latch, matriks klasifier 6 kasus, serta health dan fetch live kondisional. Perilaku live memakai kunci berurutan dengan failover key0 ke key1 dan latch 900 detik setelah semua kunci habis; tanpa kunci, statusnya degraded (scripts/check_tomtom.py:61-65; backend/app/adapters/tomtom_adapter.py:503-507). Armada menggabung baseline 45-unit di kode dengan armada kustom dan endpoint webhook TMS yang live (backend/app/routers/fleet_ingest_router.py:266-286). Split hybrid 99/73 adalah observasi probe 26-Okt terhadap /api/v1/fleet/vehicles untuk diverifikasi ulang, bukan konstanta kode; laporan tidak meng-hardcode angka tersebut ke tabel. Data yang belum real-time diganti simulasi berlabel agar tidak campur dengan operasional.",
230: "Pada lapisan analitik, komponen spesialis cuaca, lalu lintas, publik, risiko, dan alternatif dipakai bersama. Graph 8-node deterministik mengatur status dan konteks tanpa menjadikan keluaran bahasa sebagai kebenaran tunggal (agents/graph.py:56-91). Agent-4 (optimasi rute) tidak voting di gate (agents/tools/consensus_gate.py:9-10), kanal E hanya voting saat econ_conf > 0,50 (agents/tools/consensus_gate.py:368-371), dan bukti simulasi didiskon 0,90 (agents/tools/consensus_gate.py:52-55). Modul yang dirancang dapat memakai simulasi tanpa mengganggu alur utama.",
232: "Consensus Engine menilai sinyal berdasar kualitas, kebaruan, spasial-temporal, dan independensi sebelum menjadi keputusan, dan status peringatan memakai ambang terkalibrasi dari data operasional dan metrik. Syarat valid adalah >=0,85, >=2 sensor, dan koroborasi fisik (telemetri BMKG terkonfirmasi atau delay TomTom >=0,50 dalam <=30 km) atau bypass simulasi (agents/tools/consensus_gate.py:464-485). Validasi silang BMKG deterministik memakai toleransi spasial <=30 km (<=50 km gempa M>=4,5) dan temporal <=6 jam dengan ambang fisik 20 mm per jam, SIAGA atau WASPADA, M>=4,5, gelombang >=2,5 m (agents/tools/consensus_gate.py:147-254).",
235: "Sebelum menyimpulkan gangguan, PreHub memvalidasi info perjalanan bersama sumber lain. Prakiraan cuaca diperlakukan sebagai sinyal masa depan yang dipetakan ke koridor dan akurasi cuaca diuji terpisah dari deteksi. Fallback koridor memakai radius 25 km dan delay per severity saat cache TomTom kosong (agents/nodes/prediction.py:24-29,288-316).",
236: "Mitigasi menyusun Continue, Reroute, dan Hold berdasar kendala. Alternatif tidak dieksekusi otomatis, melainkan disajikan dengan waktu, risiko, dan kelayakan. Solve hedging memilih kebijakan terbaik menurut matriks dan net_savings, sedangkan proof rute memuat dasar risiko, uncertainty dampak, dan keterbatasan data (backend/app/adapters/cpu_routing_adapter.py:59-223,874-909).",
238: "Dasbor menyatukan koridor, bukti, risiko, dan mitigasi dalam satu alur dan Evidence Chain menelusuri sumber hingga rekomendasi. Mitigasi menampilkan Continue, Reroute, dan Hold/Delay dengan waktu dan risiko. Akses dibedakan per peran, yaitu Dispatcher menyetujui, Regulator hanya memberi flag HOLD di drawer HITL tanpa approvals:write, dan Guest hanya membuka pratinjau sandbox ber-watermark tanpa POST (backend/app/auth/supabase_auth.py:50-70). Penolakan server 403 berlaku untuk Regulator dan Guest pada /approvals dan fleet:write pada /fleet/register, /fleet/upload-manifest, /fleet/custom (backend/app/auth/supabase_auth.py:386-393; backend/tests/test_auth_rbac.py:233-251; backend/app/routers/fleet_ingest_router.py:108-120). Tidak ada eksekusi otomatis.",
240: "Status komponen dibedakan agar rancangan tidak dibaca sebagai sudah terimplementasi semua. Produk adalah demonstrator decision-support, bukan early-warning operasional; infrastruktur gratis cocok untuk demo, tidak untuk kebutuhan operasional kritis seperti SLA, redundansi, keamanan, dan kapasitas (Final-Gemastik/last-judgement.txt:11). Tidak ada klaim kesiapan kritis nasional dan tidak ada aktuasi otomatis (Final-Gemastik/last-judgement.txt:11,20). Tabel VII.1 dipertahankan apa adanya; penjelasan status live versus fallback ada di paragraf ini agar tabel tidak diubah.",
}

changed = []
for idx, txt in EDITS.items():
    old_len = len(d.paragraphs[idx].text)
    set_para(idx, txt)
    changed.append(idx)
    print(f"P{idx}: {old_len} -> {len(txt)}")

d.save(str(SRC))
print(f"SAVED paras={len(d.paragraphs)} tables={len(d.tables)}")
z1 = zipfile.ZipFile(str(SRC)); xml1 = z1.read("word/document.xml").decode("utf8"); z1.close()
print(f"AFTER sdt={xml1.count('<w:sdt')} mendeley={xml1.count('MENDELEY')} (before sdt={sdt_before} mendeley={mend_before})")
print(f"SHA_AFTER={sha(SRC)}")
print(f"CHANGED={sorted(changed)} COUNT={len(changed)}")
# verify counts
assert len(d.paragraphs) == n_para_before, "para count changed!"
assert len(d.tables) == n_tables_before, "table count changed!"
assert xml1.count("<w:sdt") == sdt_before, "SDT count changed!"
print("VERIFY_OK")
