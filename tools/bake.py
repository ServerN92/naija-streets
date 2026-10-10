import sys,io,json,numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from scipy import ndimage
from optimize import read_glb, acc, image, node_matrix, write_glb
def cluster(P,I,grid):
    mn=P.min(0); ext=(P.max(0)-mn).max(); cell=ext/grid
    c=np.floor((P-mn)/cell).astype(np.int64); key=(c[:,0]*(grid+2)+c[:,1])*(grid+2)+c[:,2]
    uk,inv=np.unique(key,return_inverse=True); cnt=np.bincount(inv); NP=np.zeros((len(uk),3))
    for k in range(3): NP[:,k]=np.bincount(inv,P[:,k])/cnt
    T=inv[I]; ok=(T[:,0]!=T[:,1])&(T[:,1]!=T[:,2])&(T[:,0]!=T[:,2]); T=T[ok]
    s=np.sort(T,1); _,ui=np.unique(s,axis=0,return_index=True); T=T[np.sort(ui)]
    used=np.unique(T); rm=-np.ones(len(NP),np.int64); rm[used]=np.arange(len(used)); return NP[used],rm[T]
def morton(c):
    c=((c-c.min(0))/(np.ptp(c,0).max()+1e-9)*1023).astype(np.uint64)
    def spread(x):
        x=(x|(x<<16))&0x030000FF; x=(x|(x<<8))&0x0300F00F; x=(x|(x<<4))&0x030C30C3; x=(x|(x<<2))&0x09249249; return x
    return spread(c[:,0])|(spread(c[:,1])<<np.uint64(1))|(spread(c[:,2])<<np.uint64(2))
def bake(src,dst,grid,tex=2048,rough=.85,metal=0.,crease=40):
    j,b=read_glb(src); p=j['meshes'][0]['primitives'][0]
    P0=acc(j,b,p['attributes']['POSITION']).astype(np.float64); UV0=acc(j,b,p['attributes']['TEXCOORD_0']).astype(np.float64)
    I0=acc(j,b,p['indices']).reshape(-1,3).astype(np.int64)
    M=node_matrix(j); P0=(np.c_[P0,np.ones(len(P0))]@M.T)[:,:3]
    img=np.asarray(image(j,b,j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']).convert('RGB')); ih,iw=img.shape[:2]
    NP,T=cluster(P0,I0,grid); nt=len(T)
    # spatially ordered triangles
    order=np.argsort(morton(NP[T].mean(1))); T=T[order]
    C=int(np.ceil(np.sqrt(nt/2))); s=tex/C
    k=np.arange(nt)//2; half=np.arange(nt)%2; cx=(k%C)*s; cy=(k//C)*s; pad=.9
    # local corner coords per triangle (in pixels)
    L0=np.where(half[:,None]==0, np.c_[cx+pad,cy+pad], np.c_[cx+s-pad,cy+s-pad])
    L1=np.where(half[:,None]==0, np.c_[cx+s-2*pad,cy+pad], np.c_[cx+2*pad,cy+s-pad])
    L2=np.where(half[:,None]==0, np.c_[cx+pad,cy+s-2*pad], np.c_[cx+s-pad,cy+2*pad])
    # rasterize: every texel -> (triangle, barycentric)
    ys,xs=np.mgrid[0:tex,0:tex]; px=xs+.5; py=ys+.5
    ci=np.minimum((px//s).astype(int),C-1); cj=np.minimum((py//s).astype(int),C-1); kk=cj*C+ci
    u=(px-ci*s)/s; v=(py-cj*s)/s; hh=(u+v>1).astype(int); tri=kk*2+hh; valid=tri<nt; tri=np.where(valid,tri,0)
    a=L0[tri]; bb=L1[tri]; c=L2[tri]
    den=(bb[...,1]-c[...,1])*(a[...,0]-c[...,0])+(c[...,0]-bb[...,0])*(a[...,1]-c[...,1])
    w0=((bb[...,1]-c[...,1])*(px-c[...,0])+(c[...,0]-bb[...,0])*(py-c[...,1]))/den
    w1=((c[...,1]-a[...,1])*(px-c[...,0])+(a[...,0]-c[...,0])*(py-c[...,1]))/den; w2=1-w0-w1
    V=NP[T[tri]]; pos=w0[...,None]*V[...,0,:]+w1[...,None]*V[...,1,:]+w2[...,None]*V[...,2,:]
    tree=cKDTree(P0); _,nn=tree.query(pos[valid],k=3,workers=-1)
    uvs=UV0[nn]; tx=np.clip((uvs[...,0]%1)*iw,0,iw-1).astype(int); ty=np.clip((uvs[...,1]%1)*ih,0,ih-1).astype(int)
    col=img[ty,tx].astype(np.float32).mean(1)
    out=np.zeros((tex,tex,3),np.uint8); out[valid]=np.clip(col,0,255).astype(np.uint8)
    # output geometry: non-indexed, per-corner UVs and auto-smooth normals
    Pc=NP[T].reshape(-1,3); UVc=np.stack([L0,L1,L2],1).reshape(-1,2)/tex
    fn=np.cross(NP[T[:,1]]-NP[T[:,0]],NP[T[:,2]]-NP[T[:,0]]); fa=np.linalg.norm(fn,axis=1,keepdims=True); fnu=fn/(fa+1e-12)
    vn=np.zeros_like(NP)
    for q in range(3): np.add.at(vn,T[:,q],fn)
    vn/=np.linalg.norm(vn,axis=1,keepdims=True)+1e-12
    Nc=vn[T].copy(); cosT=np.cos(np.radians(crease))
    for q in range(3):
        bad=(Nc[:,q]*fnu).sum(1)<cosT; Nc[bad,q]=fnu[bad]
    Nc=Nc.reshape(-1,3); Ti=np.arange(len(Pc)).reshape(-1,3)
    bio=io.BytesIO(); Image.fromarray(out).save(bio,'JPEG',quality=88)
    write_glb(dst,Pc,Nc,UVc,Ti,bio.getvalue(),rough,metal)
    print(f'{src}: {len(I0)} -> {nt} tris, tex {tex}, size {np.round(np.ptp(NP,0),3)}, bytes {len(bio.getvalue())//1024}KB')
if __name__=='__main__':
    bake(sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]) if len(sys.argv)>4 else 2048)
