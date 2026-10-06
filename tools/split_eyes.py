#!/usr/bin/env python3
"""Löst Augen (dunkle Formen) aus einem Freisteller und füllt die Fläche weich auf.
Aufruf: python3 tools/split_eyes.py <id> x0 y0 x1 y1 [--wink]   (Box in Bildpixeln um die Augen)
--wink: nur das rechte (größte x) Auge lösen. Schreibt assets/avatars/bits/<id>_eyes.png / _wink.png und trägt es in avatars.json ein."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
i=sys.argv[1]; x0,y0,x1,y1=map(int,sys.argv[2:6]); wink='--wink' in sys.argv
f=f'public/assets/avatars/{i}_cut.png'
im=np.array(Image.open(f).convert('RGBA')); H,W=im.shape[:2]
box=np.zeros((H,W),bool); box[y0:y1,x0:x1]=True
light='--light' in sys.argv
dark=((im[...,:3].sum(2)>520) if light else (im[...,:3].sum(2)<300))&box&(im[...,3]>100)
l,k=ndi.label(dark); sz=ndi.sum(dark,l,range(1,k+1))
order=np.argsort(sz)[::-1][:(4 if '--light' in sys.argv else 2)]+1
comps=[l==o for o in order if sz[o-1]>40]
if wink: comps=[max(comps,key=lambda c:np.where(c)[1].mean())]
piece=np.zeros((H,W),bool)
for c in comps: piece|=c
piece=ndi.binary_dilation(piece,iterations=6 if light else 5)&(im[...,3]>0)
ys,xs=np.where(piece); a1,a2,b1,b2=ys.min(),ys.max()+1,xs.min(),xs.max()+1
# Auge als eigene Ebene: Alpha aus Dunkelheit
if light:
    dk=np.clip((im[...,:3].sum(2)-420)/260,0,1)*piece; layer=np.zeros_like(im); layer[...,:3]=im[...,:3]
else:
    dk=np.clip((360-im[...,:3].sum(2))/220,0,1)*piece; layer=np.zeros_like(im); layer[...,:3]=np.minimum(im[...,:3],45)
layer[...,3]=(dk*255).astype(np.uint8)
Image.fromarray(layer[a1:a2,b1:b2],'RGBA').save(f'public/assets/avatars/bits/{i}_{"wink" if wink else "eyes"}.png')
# Fläche weich auffüllen (normalisierte Faltung, iterativ)
out=im.astype(float); known=(~piece)&(im[...,3]>0)
rgb=out[...,:3].copy(); filled=known.copy()
for it in range(60):
    w=filled.astype(float)
    num=np.dstack([ndi.uniform_filter(rgb[...,c]*w,5) for c in range(3)]); den=ndi.uniform_filter(w,5)
    new=num/np.maximum(den[...,None],1e-6)
    upd=(~filled)&(den>0.05)
    rgb[upd]=new[upd]; filled|=upd
    if filled[piece].all(): break
res=im.copy(); res[piece,:3]=np.clip(rgb[piece],0,255).astype(np.uint8)
Image.fromarray(res,'RGBA').save(f)
d=json.load(open('public/data/avatars.json'))
for a in d:
    if a['id']==i: a['wink' if wink else 'eyes']=dict(src=f'assets/avatars/bits/{i}_{"wink" if wink else "eyes"}.png',x=round(b1/W*100,2),y=round(a1/H*100,2),w=round((b2-b1)/W*100,2),h=round((a2-a1)/H*100,2))
json.dump(d,open('public/data/avatars.json','w'),ensure_ascii=False,indent=1)
bg=Image.new('RGBA',(W,H),(255,0,255,255)); bg.alpha_composite(Image.fromarray(res,'RGBA')); bg.save(f'/tmp/eyes_{i}.png')
print(i,len(comps),'Augen',b1,a1,b2,a2)
