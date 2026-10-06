#!/usr/bin/env python3
"""Löst lose Teile (eigene Pixelinseln) aus <id>_cut.png als Einzelbilder und erzeugt <id>_head.png.
Aufruf: python3 tools/split_bits.py <id> [--no-bits]   (trägt bits in public/data/avatars.json ein, falls der Avatar dort steht)"""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
n=sys.argv[1]; nobits='--no-bits' in sys.argv
f=f'public/assets/avatars/{n}_cut.png'
im=np.array(Image.open(f).convert('RGBA')); H,W=im.shape[:2]
m=im[...,3]>8
l,k=ndi.label(ndi.binary_dilation(im[...,3]>40,iterations=1))
sizes=ndi.sum(im[...,3]>40,l,range(1,k+1)); big=int(np.argmax(sizes))+1
bits=[]; out=im.copy()
if not nobits:
  for i in range(1,k+1):
    if i==big or sizes[i-1]<120: continue
    comp=ndi.binary_dilation(l==i,iterations=3)&m
    ys,xs=np.where(comp); y1,y2,x1,x2=max(0,ys.min()-2),min(H,ys.max()+3),max(0,xs.min()-2),min(W,xs.max()+3)
    crop=im.copy(); crop[~comp]=0
    Image.fromarray(crop[y1:y2,x1:x2],'RGBA').save(f'public/assets/avatars/bits/{n}_{len(bits)+1}.png')
    out[comp]=0
    bits.append(dict(src=f'assets/avatars/bits/{n}_{len(bits)+1}.png',x=round(float(x1)/W*100,2),y=round(float(y1)/H*100,2),w=round(float(x2-x1)/W*100,2),h=round(float(y2-y1)/H*100,2)))
  Image.fromarray(out,'RGBA').save(f)
# Kopf-Bild: oberer Teil des Hauptkörpers, quadratisch
body=(l==big); ys,xs=np.where(body); by1,by2,bx1,bx2=ys.min(),ys.max()+1,xs.min(),xs.max()+1
side=int(min(max(bx2-bx1,(by2-by1)*0.62),max(W,H)))
cx=(bx1+bx2)//2; x0=max(0,cx-side//2); y0=by1
crop=Image.fromarray(out,'RGBA').crop((x0,y0,min(W,x0+side),min(H,y0+side)))
sq=Image.new('RGBA',(side,side),(0,0,0,0)); sq.paste(crop,(0,0)); sq.resize((256,256),Image.LANCZOS).save(f'public/assets/avatars/{n}_head.png')
d=json.load(open('public/data/avatars.json'))
for a in d:
    if a['id']==n and not nobits: a['bits']=bits
json.dump(d,open('public/data/avatars.json','w'),ensure_ascii=False,indent=1)
print(n,W,H,'bits',len(bits))
