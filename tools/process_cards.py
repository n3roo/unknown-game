#!/usr/bin/env python3
"""Macht aus ChatGPT-Karten fertige Spielkarten: weissen Rand abschneiden, Ecken abrunden, als webp ablegen.
Aufruf: python3 tools/process_cards.py <Nummer>=<Bilddatei> ...   z. B.  0=sombrero.png 16=gold.png
Ausgabe: public/assets/cards/western/<Nummer>.webp  (Nummer = Charakter*7 + Accessoire)"""
import sys, os
from PIL import Image, ImageDraw, ImageChops
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'cards', 'western')
os.makedirs(OUT, exist_ok=True)
for arg in sys.argv[1:]:
    num, src = arg.split('=', 1)
    im = Image.open(src).convert('RGB')
    diff = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > 40 else 0)
    c = im.crop(diff.getbbox()); w, h = c.size
    c = c.resize((600, round(600 * h / w)), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', c.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, c.size[0] - 1, c.size[1] - 1), radius=int(c.size[0] * 0.07), fill=255)
    c.putalpha(m)
    c.save(os.path.join(OUT, f'{int(num)}.webp'), quality=90)
    print('ok', num, c.size)


# sets.json: Liste der vorhandenen Kartenbilder aktualisieren (nur diese werden geladen)
import json, os, re
_dir = os.path.join('public', 'assets', 'cards', 'western')
_ids = sorted(int(f[:-5]) for f in os.listdir(_dir) if re.fullmatch(r'\d+\.webp', f))
_p = os.path.join('public', 'data', 'sets.json')
_d = json.load(open(_p, encoding='utf-8'))
_d['sets'][0]['cardArtIds'] = _ids
open(_p, 'w', encoding='utf-8').write(json.dumps(_d, ensure_ascii=False, indent=1))
print('cardArtIds:', _ids)
