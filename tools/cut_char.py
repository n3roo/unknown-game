#!/usr/bin/env python3
"""Schneidet eine Figur aus einem hellen Hintergrund frei (GrabCut + Schattenentfernung).
Aufruf: python3 tools/cut_char.py <in.png> <out_cut.png> [x0 y0 x1 y1]"""
import sys, cv2, numpy as np
from scipy import ndimage as ndi
src=cv2.imread(sys.argv[1]); 
if len(sys.argv)>=7: x0,y0,x1,y1=map(int,sys.argv[3:7]); src=src[y0:y1,x0:x1]
h,w=src.shape[:2]
bg=np.median(np.vstack([src[:8].reshape(-1,3),src[-8:].reshape(-1,3),src[:,:8].reshape(-1,3),src[:,-8:].reshape(-1,3)]),axis=0)
diff=np.linalg.norm(src.astype(float)-bg,axis=2)
mask=np.full((h,w),cv2.GC_BGD,np.uint8)
mask[diff>=7]=cv2.GC_PR_FGD
mask[diff>=22]=cv2.GC_PR_FGD
sure=ndi.binary_erosion(diff>60,iterations=3)
mask[sure]=cv2.GC_FGD
bgm=np.zeros((1,65)); fgm=np.zeros((1,65))
cv2.grabCut(src,mask,None,bgm,fgm,6,cv2.GC_INIT_WITH_MASK)
fg=((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD))
# Schatten am Boden: graue, wenig gesättigte, mittelhelle Pixel im unteren Bereich ohne Verbindung zu "sicherem" Körper entfernen
hsv=cv2.cvtColor(src,cv2.COLOR_BGR2HSV).astype(float)
shadow=(hsv[...,1]<40)&(hsv[...,2]>150)&(diff<70)
ys=np.arange(h)[:,None]
fg2=fg&~(shadow&(ys>h*0.62))
fg2=ndi.binary_opening(fg2,iterations=1)
lab,n=ndi.label(fg2); sz=ndi.sum(fg2,lab,range(1,n+1))
keep=np.zeros_like(fg2)
for i in range(1,n+1):
    if sz[i-1]>=max(60,sz.max()*0.002): keep|=lab==i
keep=ndi.binary_fill_holes(keep)
keep=ndi.binary_erosion(keep,iterations=1)
a=cv2.GaussianBlur(keep.astype(np.float32),(0,0),0.9); a=np.clip((a-0.2)/0.6,0,1)
# Farb-Dekontamination der Ränder
inner=ndi.binary_erosion(keep,iterations=3)
idx=ndi.distance_transform_edt(~inner,return_distances=False,return_indices=True)
col=src[idx[0],idx[1]]
out=np.dstack([col,(a*255).astype(np.uint8)])
ys_,xs_=np.where(a>0.05); out=out[ys_.min():ys_.max()+1,xs_.min():xs_.max()+1]
rgba=cv2.cvtColor(out,cv2.COLOR_BGRA2RGBA) if False else out[...,[2,1,0,3]]
from PIL import Image
Image.fromarray(rgba,'RGBA').save(sys.argv[2]); print(sys.argv[2],rgba.shape[1],rgba.shape[0])
