"""Fix italics: ensure foreign terms have w:i (no val), others have no w:i."""
import pathlib, hashlib, zipfile
from docx import Document
from lxml import etree

SRC = pathlib.Path("Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx")
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
def qn(tag): return f"{{{W}}}{tag}"

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
FOREIGN_SORTED = sorted(FOREIGN, key=len, reverse=True)

def split_foreign(text):
    out=[]; i=0
    while i < len(text):
        hit=None
        for term in FOREIGN_SORTED:
            if text.startswith(term, i):
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
                if any(text.startswith(t,j) for t in FOREIGN_SORTED):
                    break
                j+=1
            out.append((text[i:j],False)); i=j
    return out

d = Document(str(SRC))
# edited indices from unitA
EDITED=[93,95,99,100,101,102,103,104,109,111,113,115,117,122,124,135,138,140,142,144,187,211,218,224,228,230,232,235,236,238,240]
for idx in EDITED:
    para=d.paragraphs[idx]
    el=para._element
    # current full text (runs only, SDT excluded from para.text? para.text excludes SDT, good)
    full=para.text
    # capture base rPr WITHOUT i (strip i)
    first_r=el.find("w:r", NS)
    base_rpr_xml=None
    if first_r is not None:
        rpr=first_r.find("w:rPr", NS)
        if rpr is not None:
            # remove all w:i from a copy
            rpr_copy=etree.fromstring(etree.tostring(rpr))
            for ie in rpr_copy.findall(qn("i"), NS):
                # lxml findall with ns?
                pass
            # manual: remove by tag
            for child in list(rpr_copy):
                if child.tag==qn("i"):
                    rpr_copy.remove(child)
            base_rpr_xml=etree.tostring(rpr_copy)
    # remove old runs
    for child in list(el):
        if child.tag in (qn("r"), qn("proofErr"), qn("hyperlink"), qn("bookmarkStart"), qn("bookmarkEnd")):
            el.remove(child)
    sdts=el.findall("w:sdt", NS)
    def make_run(text, italic):
        r=etree.Element(qn("r"))
        if base_rpr_xml is not None:
            r.append(etree.fromstring(base_rpr_xml))
        rpr=r.find(qn("rPr"), NS)
        if rpr is None:
            rpr=etree.Element(qn("rPr")); r.insert(0,rpr)
        if italic:
            ie=etree.Element(qn("i"))
            rpr.append(ie)
        t=etree.SubElement(r, qn("t"))
        t.set("{http://www.w3.org/XML/1998/namespace}space","preserve")
        t.text=text
        return r
    segs=split_foreign(full)
    runs=[make_run(s,it) for s,it in segs if s!=""]
    if sdts:
        idx_first=list(el).index(sdts[0])
        for k,r in enumerate(runs):
            el.insert(idx_first+k, r)
    else:
        for r in runs:
            el.append(r)
    print(f"P{idx}: segs={len(segs)} italic={[s for s,it in segs if it][:4]}")

d.save(str(SRC))
print("FIX_SAVED")
z=zipfile.ZipFile(str(SRC)); xml=z.read("word/document.xml").decode("utf8"); z.close()
print("sdt", xml.count("<w:sdt"), "mendeley", xml.count("MENDELEY"))
