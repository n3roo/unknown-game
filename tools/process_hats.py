#!/usr/bin/env python3
"""Grünes Hut-Raster (4x4, #00FF00) -> public/assets/hats/<id>.webp  (Aufruf: python3 tools/process_hats.py raster.png)"""
import sys, numpy as np
from PIL import Image, ImageFilter
ORDER = ['basecap','muetze','partyhut','koch','cowboy','fez','zylinder','propeller','pirat','wikinger','zauberer','krone','liga_silber','liga_gold','liga_diamant','liga_meister']
im = Image.open(sys.argv[1]).convert('RGB'); a = np.asarray(im).astype(float)
r,g,b = a[...,0],a[...,1],a[...,2]
d = g - np.maximum(r,b)                       # Grünüberschuss
alpha = np.clip(1 - (d-25)/70, 0, 1)          # 0 bei starkem Grün, weicher Rand
# Entgrünen: g auf max(r,b) begrenzen am Rand
g2 = np.where(d>0, np.maximum(r,b)+np.minimum(d,0), g)
rgba = np.dstack([r,np.minimum(g,np.maximum(r,b)+8),b,alpha*255]).astype(np.uint8)
full = Image.fromarray(rgba,'RGBA'); W,H = full.size
def tint(img, hue_shift, sat=1.0):
    h = img.convert('RGB').convert('HSV'); n = np.asarray(h).copy()
    n[...,0] = (n[...,0].astype(int)+hue_shift)%256; n[...,1]=np.clip(n[...,1]*sat,0,255)
    o = Image.fromarray(n,'HSV').convert('RGB'); o.putalpha(img.split()[3]); return o
from scipy import ndimage as ndi
solid = alpha>0.5
lab,_n = ndi.label(solid)
sizes = ndi.sum(solid, lab, range(1,_n+1))
cells = {}
for gid in range(1,_n+1):
    if sizes[gid-1] < 150: continue
    ys,xs = np.where(lab==gid); cells.setdefault((int(xs.mean())*4//W, int(ys.mean())*4//H), []).append((sizes[gid-1],gid))
sel = {}
for i in range(16):
    lst = cells[(i%4,i//4)]; top = max(lst)[0]
    sel[i] = [g for sz,g in lst if sz > 0.04*top]
out = {}
for i,id_ in enumerate(ORDER):
    cx,cy = i%4,i//4
    m = np.isin(lab, sel[i]); m = ndi.binary_dilation(m, iterations=3)
    ys,xs = np.where(m); bb = (xs.min(),ys.min(),xs.max()+1,ys.max()+1)
    keep = np.asarray(full).copy(); keep[...,3] = np.where(m, keep[...,3], 0)
    out[id_] = Image.fromarray(keep,'RGBA').crop(bb)
out['liga_platin'] = tint(out['liga_silber'], -24, 1.6)   # fehlt im Raster: Silberkrone türkis eingefärbt
CW,CH = 400,280
for id_,hat in out.items():
    s = min(CW/hat.width, CH*0.94/hat.height); hat = hat.resize((max(1,int(hat.width*s)),max(1,int(hat.height*s))), Image.LANCZOS)
    c = Image.new('RGBA',(CW,CH),(0,0,0,0)); c.paste(hat,((CW-hat.width)//2, int(CH*0.94)-hat.height), hat)
    c.save(f'public/assets/hats/{id_}.webp', quality=88)
    print(id_, hat.size)
