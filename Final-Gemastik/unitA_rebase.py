"""Unit A rebase: preserve Unit B tables/footnotes, re-apply softening to 135,224,228,235,239; fix italics EYD V."""
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
backup = SRC.parent / f"Laporan-PreHub-GEMASTIK19.backup-unitA-rebase-{ts}.docx"
shutil.copy2(SRC, backup)
print(f"BACKUP={backup}")

d = Document(str(SRC))
z0 = zipfile.ZipFile(str(SRC)); xml0=z0.read("word/document.xml").decode("utf8"); z0.close()
sdt_before=xml0.count("<w:sdt"); mend_before=xml0.count("MENDELEY")
print(f"BEFORE paras={len(d.paragraphs)} tables={len(d.tables)} sdt={sdt_before}")

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
FSORT=sorted(FOREIGN,key=len,reverse=True)
def split_foreign(text):
    out=[]; i=0
    while i < len(text):
        hit=None
        for term in FSORT:
            if text.startswith(term,i):
                before=text[i-1] if i>0 else " "
                after=text[i+len(term)] if i+len(term)<len(text) else " "
                if term in ("Continue","Reroute"):
                    if (before.isalnum() or before=="_") or (after.isalnum() or after=="_"):
                        continue
                hit=term; break
        if hit:
            out.append((hit,True)); i+=len(hit)
        else:
            j=i+1
            while j<=len(text):
                if any(text.startswith(t,j) for t in FSORT):
                    break
                j+=1
            out.append((text[i:j],False)); i=j
    return out

def set_para(idx, new_text):
    para=d.paragraphs[idx]
    el=para._element
    first_r=el.find("w:r", NS)
    base_rpr_xml=None
    if first_r is not None:
        rpr=first_r.find("w:rPr", NS)
        if rpr is not None:
            # copy then strip all w:i
            tmp=etree.fromstring(etree.tostring(rpr))
            for ch in list(tmp):
                if ch.tag==qn("i"):
                    tmp.remove(ch)
            base_rpr_xml=etree.tostring(tmp)
    for ch in list(el):
        if ch.tag in (qn("r"),qn("proofErr"),qn("hyperlink"),qn("bookmarkStart"),qn("bookmarkEnd")):
            el.remove(ch)
    sdts=el.findall("w:sdt", NS)
    def mk(t, it):
        r=etree.Element(qn("r"))
        if base_rpr_xml is not None:
            r.append(etree.fromstring(base_rpr_xml))
        rpr=r.find(qn("rPr"), NS)
        if rpr is None:
            rpr=etree.Element(qn("rPr")); r.insert(0,rpr)
        if it:
            etree.SubElement(rpr, qn("i"))
        tt=etree.SubElement(r, qn("t"))
        tt.set("{http://www.w3.org/XML/1998/namespace}space","preserve")
        tt.text=t
        return r
    segs=split_foreign(new_text)
    runs=[mk(s,it) for s,it in segs if s!=""]
    if sdts:
        pos=list(el).index(sdts[0])
        for k,r in enumerate(runs):
            el.insert(pos+k, r)
    else:
        for r in runs:
            el.append(r)

REBASE={
135: "Tim tidak memakai fixture sebagai klaim akses real-time; laporan memisahkan hasil uji fixture dari hasil uji data aktual agar pembaca tidak salah tafsir; definisi fixture BULOG lihat catatan kaki fixture BULOG.",
224: "PreHub adalah aplikasi web modular dengan Next.js di frontend, FastAPI di backend, dan PostgreSQL dengan PostGIS untuk spasial. Nama produk adalah PreHub dan alias deploy adalah peta-nadi (render.yaml:3; render.yaml:69-72). URL publik dan CORS memakai https://peta-nadi.onrender.com, sedangkan SOP lokal memakai http://localhost:3000 dan http://localhost:8000. Struktur modular memungkinkan uji komponen terpisah dan penggantian fixture simulasi dengan sumber operasional bertahap tanpa mengganggu antarmuka. Status operasional lihat Batasan; label BULOG adalah fixture, lihat catatan kaki fixture BULOG.",
228: "Tahap ingestion menormalisasi, memvalidasi, mendedup, geocode, dan memetakan H3, lalu event diteruskan lewat event stream dengan metadata. Probe live 26-Okt memakai scripts/check_tomtom.py:40-89; perilaku kunci/latch dan status degraded lihat catatan kaki TomTom. Armada menggabung baseline 45-unit di kode dengan armada kustom dan endpoint webhook TMS yang live (backend/app/routers/fleet_ingest_router.py:266-286). Split hybrid 99/73 adalah observasi probe 26-Okt terhadap /api/v1/fleet/vehicles untuk diverifikasi ulang, bukan konstanta kode; laporan tidak meng-hardcode angka tersebut ke tabel. Data yang belum real-time diganti simulasi berlabel agar tidak campur dengan operasional.",
235: "Sebelum menyimpulkan gangguan, PreHub memvalidasi info perjalanan bersama sumber lain. Prakiraan cuaca diperlakukan sebagai sinyal masa depan yang dipetakan ke koridor dan akurasi cuaca diuji terpisah dari deteksi. Fallback koridor sesuai Tabel VII.2 saat cache TomTom kosong (agents/nodes/prediction.py:24-29,288-316).",
239: "Dasbor menyatukan koridor, bukti, risiko, dan mitigasi dalam satu alur dan Evidence Chain menelusuri sumber hingga rekomendasi. Mitigasi menampilkan Continue, Reroute, dan Hold/Delay dengan waktu dan risiko. Pembagian peran dan penolakan server lihat Tabel VII.3. Tidak ada eksekusi otomatis.",
}
for idx,txt in REBASE.items():
    print(f"REBASE P{idx}: {len(d.paragraphs[idx].text)} -> {len(txt)}")
    set_para(idx, txt)

# italic-only refresh for other Unit A paras (text unchanged, rebuild runs to fix w:i)
ITALIC_REFRESH=[93,95,99,100,101,102,103,104,109,111,113,115,117,122,124,138,140,142,144,187,211,218,230,232,237]
for idx in ITALIC_REFRESH:
    cur=d.paragraphs[idx].text
    set_para(idx, cur)
    print(f"ITALIC_REFRESH P{idx}")

d.save(str(SRC))
print(f"SAVED paras={len(d.paragraphs)} tables={len(d.tables)}")
z1=zipfile.ZipFile(str(SRC)); xml1=z1.read("word/document.xml").decode("utf8"); z1.close()
print(f"AFTER sdt={xml1.count('<w:sdt')} mendeley={xml1.count('MENDELEY')} (before {sdt_before}/{mend_before})")
print(f"SHA_AFTER={sha(SRC)}")
assert len(d.paragraphs)==325, "para count changed!"
assert len(d.tables)==7, "table count changed!"
assert xml1.count("<w:sdt")==sdt_before, "SDT changed!"
print("VERIFY_OK")
