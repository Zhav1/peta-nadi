import io, re, sys

path = r"scripts/build_benchmark_dataset.py"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# (scenario id, old snippet inside that scenario, new snippet)
patches = [
    ("SUM-SCN-011", '"WASPADA", 30.0, 20, 0.78', '"WASPADA", 20.0, 20, 0.78'),
    ("SUM-SCN-012", '"NORMAL", 5.0, 10, 0.90', '"NORMAL", 3.0, 10, 0.90'),
    ("SUM-SCN-014", '"NORMAL", 0.0, 40, 0.60', '"NORMAL", 0.0, 26, 0.60'),
    ("SUM-SCN-022", '"WASPADA", 14.0, 18, 0.76', '"NORMAL", 14.0, 18, 0.76'),
    ("SUM-SCN-032", '"NORMAL", 0.0, 30, 0.68', '"NORMAL", 0.0, 26, 0.68'),
    ("SUM-SCN-049", '"WASPADA", 15.0, 10, 0.88', '"WASPADA", 12.0, 10, 0.88'),
]

# Split the file into per-scenario windows delimited by the id literal.
for sid, old, new in patches:
    anchor = text.find('"%s"' % sid)
    if anchor == -1:
        print("missing scenario", sid)
        sys.exit(1)
    nxt = text.find('"%s"' % ("SUM-SCN-%03d" % (int(sid[-3:]) + 1)), anchor)
    end = nxt if nxt != -1 else len(text)
    window = text[anchor:end]
    if window.count(old) != 1:
        print("snippet ambiguity for", sid, window.count(old))
        sys.exit(1)
    text = text[:anchor] + window.replace(old, new) + text[end:]

with io.open(path, "w", encoding="utf-8") as f:
    f.write(text)
print("patched", len(patches))
