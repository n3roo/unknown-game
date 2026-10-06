"""Kanten glätten + Farbsaum entfernen: python3 tools/polish_edges.py <id> [sigma] [erode]"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
n=sys.argv[1]; sg=float(sys.argv[2]) if len(sys.argv)>2 else 1.4; er=int(sys.argv[3]) if len(sys.argv)>3 else 1
p=f'public/assets/avatars/{n}_cut.png'
a=np.array(Image.open(p).convert('RGBA')).astype(float)
m=a[...,3]>110
m=ndi.binary_fill_holes(m)
lab,k=ndi.label(m)
if k>1:
    sz=ndi.sum(m,lab,range(1,k+1)); keep=[i+1 for i,s in enumerate(sz) if s>0.02*m.sum()]
    m=np.isin(lab,keep)
if er: m=ndi.binary_erosion(m,iterations=er)
s=ndi.gaussian_filter(m.astype(float),sg)
al=np.clip((s-.5)*2.6+.5,0,1)
# Farbsaum: Randfarben aus dem Inneren übernehmen
inner=ndi.binary_erosion(m,iterations=4)
w=inner.astype(float); den=np.maximum(ndi.gaussian_filter(w,3),1e-3)
for c in range(3):
    g=ndi.gaussian_filter(a[...,c]*w,3)/den
    edge=(al>0)&~inner
    a[...,c]=np.where(edge,g,a[...,c])
a[...,3]=al*255
Image.fromarray(a.astype(np.uint8)).save(p)
