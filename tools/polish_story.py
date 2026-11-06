"""Вычитка перенесённых сцен (02.11.2026): запускать после сборки любого блока.
   python3 tools/polish_story.py data/public/story/*.json
 - убирает служебные скобки сценаристов «(или …)», «(если …)»;
 - строки целиком в [ квадратных скобках ] — окно Системы (шаг sys);
 - слишком длинный абзац рассказчика или мысль делит по предложениям (экран телефона);
 - точечные правки формулировок, где сценарий обращался к «игроку».
"""
import json, re, sys

FIX = {"но решать, что сказать ей об этом, будет игрок.": "Что сказать ей об этом — решать ему."}
MAXLEN = 460

def clean(s):
    s = re.sub(r"\s*\((?:или|если|Если)\b[^()]*\)", "", s)
    s = s.replace("[ Магия ]", "«Магия»").replace("[{mp}/{mpmax}]", "{mp} / {mpmax}")
    for a, b in FIX.items(): s = s.replace(a, b)
    return re.sub(r"\s{2,}", " ", s).strip()

def split(s):
    if len(s) <= MAXLEN: return [s]
    parts, cur = [], ""
    for sent in re.split(r"(?<=[.!?…»])\s+(?=[«А-ЯЁA-Z—])", s):
        if cur and len(cur) + 1 + len(sent) > MAXLEN * 0.8: parts.append(cur); cur = sent
        else: cur = (cur + " " + sent).strip()
    if cur: parts.append(cur)
    return parts

def fix(steps):
    out = []
    for x in steps:
        if not isinstance(x, dict): out.append(x); continue
        x = dict(x)
        for k in ("options", "case"):
            if k in x: x[k] = [dict(o, steps=fix(o.get("steps", []))) for o in x[k]]
        for k in ("then", "else"):
            if k in x: x[k] = fix(x[k])
        if "n" in x and isinstance(x["n"], str):
            s = clean(x["n"])
            m = re.fullmatch(r"\[\s*(.+?)\s*\]\.?", s)
            if m and "[" not in m.group(1): out.append({"sys": [m.group(1)]}); continue
            for i, p in enumerate(split(s)): out.append(dict(x, n=p) if i == 0 else {"n": p})
            continue
        if "think" in x and isinstance(x["think"], str):
            for i, p in enumerate(split(clean(x["think"]))): out.append(dict(x, think=p) if i == 0 else {"think": p})
            continue
        for k in ("t", "msg"):
            if k in x and isinstance(x[k], str): x[k] = clean(x[k])
        out.append(x)
    return out

if __name__ == "__main__":
    for path in sys.argv[1:]:
        d = json.load(open(path, encoding="utf8")); before = json.dumps(d, ensure_ascii=False)
        for sc in d.get("scenes", []): sc["steps"] = fix(sc.get("steps", [])); sc["absent"] = fix(sc["absent"]) if "absent" in sc else None
        for sc in d.get("scenes", []):
            if sc.get("absent") is None: sc.pop("absent", None)
        after = json.dumps(d, ensure_ascii=False)
        if after != before: open(path, "w", encoding="utf8").write(json.dumps(d, ensure_ascii=False, indent=1) + "\n"); print("исправлено:", path)
