import sys,io,numpy as np
from PIL import Image, ImageDraw
from optimize import read_glb, acc, image
def load(path):
    j,b=read_glb(path); p=j['meshes'][0]['primitives'][0]
    P=acc(j,b,p['attributes']['POSITION']).astype(float); UV=acc(j,b,p['attributes']['TEXCOORD_0']).astype(float)
    I=acc(j,b,p['indices']).reshape(-1,3); T=np.asarray(image(j,b,j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']).convert('RGB').resize((1024,1024)))/255.
    return P,UV,I,T
def render(P,UV,I,T,yaw,pitch=.35,S=360):
    P=P-(P.max(0)+P.min(0))/2; sc=S*.8/np.abs(P).max()/2
    cy,sy=np.cos(yaw),np.sin(yaw); x=P[:,0]*cy+P[:,2]*sy; z=-P[:,0]*sy+P[:,2]*cy; y=P[:,1]
    cp,sp=np.cos(pitch),np.sin(pitch); y2=y*cp-z*sp; z2=y*sp+z*cp
    sx=S/2+x*sc; syy=S/2-y2*sc; th,tw=T.shape[:2]
    zb=np.full((S,S),-1e9); out=np.ones((S,S,3))*np.array([.16,.17,.2])
    fn=np.cross(np.c_[x,y2,z2][I[:,1]]-np.c_[x,y2,z2][I[:,0]],np.c_[x,y2,z2][I[:,2]]-np.c_[x,y2,z2][I[:,0]]); fn/=np.linalg.norm(fn,axis=1,keepdims=True)+1e-12
    L=np.array([.4,.7,.6]); L/=np.linalg.norm(L); shade=.5+.55*np.abs(fn@L)
    for t,(a,b,c) in enumerate(I):
        xs=sx[[a,b,c]]; ys=syy[[a,b,c]]
        x0=max(int(xs.min()),0); x1=min(int(xs.max())+1,S-1); y0=max(int(ys.min()),0); y1=min(int(ys.max())+1,S-1)
        if x0>x1 or y0>y1: continue
        den=(ys[1]-ys[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(ys[0]-ys[2])
        if abs(den)<1e-9: continue
        gx,gy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        w0=((ys[1]-ys[2])*(gx-xs[2])+(xs[2]-xs[1])*(gy-ys[2]))/den; w1=((ys[2]-ys[0])*(gx-xs[2])+(xs[0]-xs[2])*(gy-ys[2]))/den; w2=1-w0-w1
        m=(w0>=0)&(w1>=0)&(w2>=0)
        if not m.any(): continue
        zz=w0*z2[a]+w1*z2[b]+w2*z2[c]; sub=zb[y0:y1+1,x0:x1+1]; m&=zz>sub
        if not m.any(): continue
        u=w0*UV[a,0]+w1*UV[b,0]+w2*UV[c,0]; v=w0*UV[a,1]+w1*UV[b,1]+w2*UV[c,1]
        col=T[np.clip((v%1)*th,0,th-1).astype(int),np.clip((u%1)*tw,0,tw-1).astype(int)]
        o=out[y0:y1+1,x0:x1+1]; o[m]=np.clip(col[m]*shade[t],0,1); sub[m]=zz[m]
    return (out*255).astype(np.uint8)
if __name__=='__main__':
    files=sys.argv[2:]; rows=[]
    for f in files:
        P,UV,I,T=load(f); rows.append(np.concatenate([render(P,UV,I,T,a) for a in (0.6,2.2,3.8,5.4)],1))
    Image.fromarray(np.concatenate(rows,0)).save(sys.argv[1])
