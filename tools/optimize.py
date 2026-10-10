import json,struct,io,sys,numpy as np
from PIL import Image
def read_glb(path):
    b=open(path,'rb').read(); off=12; ch=[]
    while off<len(b):
        cl,ct=struct.unpack('<I4s',b[off:off+8]); ch.append(b[off+8:off+8+cl]); off+=8+cl
    return json.loads(ch[0]), ch[1]
def acc(j,bin_,i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    dt={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8,5120:np.int8}[a['componentType']]
    stride=bv.get('byteStride'); start=bv.get('byteOffset',0)+a.get('byteOffset',0)
    if stride and stride!=n*np.dtype(dt).itemsize:
        isz=np.dtype(dt).itemsize; raw=np.frombuffer(bin_,dtype=np.uint8,count=stride*a['count'],offset=start).reshape(a['count'],stride)
        arr=raw[:,:n*isz].copy().view(dt).reshape(a['count'],n)
        if a.get('normalized'): arr=arr.astype(np.float64)/{5123:65535.,5121:255.,5120:127.,5122:32767.}[a['componentType']]
        return arr
    arr=np.frombuffer(bin_,dtype=dt,count=a['count']*n,offset=start).reshape(-1,n) if n>1 else np.frombuffer(bin_,dtype=dt,count=a['count'],offset=start)
    if a.get('normalized'): arr=arr.astype(np.float64)/{5123:65535.,5121:255.,5120:127.,5122:32767.}[a['componentType']]
    return arr
def image(j,bin_,idx):
    img=j['images'][j['textures'][idx]['source']]; bv=j['bufferViews'][img['bufferView']]
    return Image.open(io.BytesIO(bin_[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]))
def node_matrix(j):
    # combine first mesh node transform (only matrix/TRS on the mesh node chain, simple case)
    M=np.eye(4)
    for n in j['nodes']:
        if 'matrix' in n and 'mesh' in n: M=np.array(n['matrix']).reshape(4,4).T
    return M
def simplify(P,UV,I,grid,uvq):
    mn=P.min(0); ext=(P.max(0)-mn).max(); cell=ext/grid
    c=np.floor((P-mn)/cell).astype(np.int64); u=np.floor(UV*uvq).astype(np.int64)
    key=(((c[:,0]*(grid+2)+c[:,1])*(grid+2)+c[:,2])*(uvq*4+8)+(u[:,0]+2*uvq))*(uvq*4+8)+(u[:,1]+2*uvq)
    uk,inv=np.unique(key,return_inverse=True)
    cnt=np.bincount(inv); NP=np.zeros((len(uk),3)); NU=np.zeros((len(uk),2))
    for k in range(3): NP[:,k]=np.bincount(inv,P[:,k])/cnt
    d=((P-NP[inv])**2).sum(1); order=np.lexsort((d,inv)); first=order[np.r_[0,np.flatnonzero(np.diff(inv[order]))+1]]
    NU=UV[first]
    T=inv[I]; ok=(T[:,0]!=T[:,1])&(T[:,1]!=T[:,2])&(T[:,0]!=T[:,2]); T=T[ok]
    s=np.sort(T,1); _,ui=np.unique(s,axis=0,return_index=True); T=T[np.sort(ui)]
    used=np.unique(T); remap=-np.ones(len(NP),np.int64); remap[used]=np.arange(len(used))
    return NP[used],NU[used],remap[T]
def bleed(im):
    from scipy import ndimage
    a=np.asarray(im).astype(np.uint8); small=max(a.shape[:2])>2048
    if small: im2=im.resize((2048,2048),Image.LANCZOS); a=np.asarray(im2)
    mask=a.max(2)<10
    mask=ndimage.binary_opening(mask,iterations=1)
    if mask.any() and not mask.all():
        _,ind=ndimage.distance_transform_edt(mask,return_indices=True); a=a[ind[0],ind[1]]
    return Image.fromarray(a)
def normals(P,T):
    fn=np.cross(P[T[:,1]]-P[T[:,0]],P[T[:,2]]-P[T[:,0]]); N=np.zeros_like(P)
    for k in range(3): np.add.at(N,T[:,k],fn)
    N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-12; return N
def write_glb(path,P,N,UV,T,jpeg,rough=.8,metal=0.):
    P=P.astype(np.float32)
    Nq=np.clip(np.round(N*127),-127,127).astype(np.int8); Nq=np.c_[Nq,np.zeros(len(Nq),np.int8)]  # pad to 4 bytes
    UVq=np.clip(np.round(np.clip(UV,0,1)*65535),0,65535).astype(np.uint16)
    idx=T.astype(np.uint16 if len(P)<65535 else np.uint32).ravel()
    parts=[]; views=[]; off=0
    def add(data,target=None,stride=None):
        nonlocal off
        pad=(-len(data))%4; v={'buffer':0,'byteOffset':off,'byteLength':len(data)}
        if target: v['target']=target
        if stride: v['byteStride']=stride
        views.append(v); parts.append(data+b'\0'*pad); off+=len(data)+pad; return len(views)-1
    vp=add(P.tobytes(),34962); vn=add(Nq.tobytes(),34962,4); vu=add(UVq.tobytes(),34962); vi=add(idx.tobytes(),34963); vimg=add(jpeg)
    j={'asset':{'version':'2.0','generator':'naija-streets optimizer'},'extensionsUsed':['KHR_mesh_quantization'],'extensionsRequired':['KHR_mesh_quantization'],
       'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
       'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'indices':3,'material':0}]}],
       'materials':[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':metal,'roughnessFactor':rough}}],
       'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':[{'bufferView':vimg,'mimeType':'image/jpeg'}],
       'accessors':[{'bufferView':vp,'componentType':5126,'count':len(P),'type':'VEC3','min':P.min(0).tolist(),'max':P.max(0).tolist()},
                    {'bufferView':vn,'componentType':5120,'normalized':True,'count':len(P),'type':'VEC3'},
                    {'bufferView':vu,'componentType':5123,'normalized':True,'count':len(P),'type':'VEC2'},
                    {'bufferView':vi,'componentType':5123 if idx.dtype==np.uint16 else 5125,'count':len(idx),'type':'SCALAR'}],
       'bufferViews':views,'buffers':[{'byteLength':off}]}
    js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((-len(js))%4); binb=b''.join(parts)
    out=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binb))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binb),b'BIN\0')+binb
    open(path,'wb').write(out)
def run(src,dst,grid,uvq=48,tex=1024,rough=.8,metal=0.):
    j,bin_=read_glb(src); p=j['meshes'][0]['primitives'][0]
    P=acc(j,bin_,p['attributes']['POSITION']).astype(np.float64); UV=acc(j,bin_,p['attributes']['TEXCOORD_0']).astype(np.float64)
    I=acc(j,bin_,p['indices']).reshape(-1,3).astype(np.int64) if 'indices' in p else np.arange(len(P)).reshape(-1,3)
    M=node_matrix(j); P=(np.c_[P,np.ones(len(P))]@M.T)[:,:3]
    NP,NU,T=simplify(P,UV,I,grid,uvq); N=normals(NP,T)
    im=image(j,bin_,j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']).convert('RGB')
    im=bleed(im)
    if max(im.size)>tex: im=im.resize((tex,tex),Image.LANCZOS)
    bio=io.BytesIO(); im.save(bio,'JPEG',quality=86); write_glb(dst,NP,N,NU,T,bio.getvalue(),rough,metal)
    print(f'{src} -> {dst}: tris {len(I)} -> {len(T)}, verts {len(NP)}, size {np.round(NP.max(0)-NP.min(0),3)}')
    return NP,T
if __name__=='__main__':
    run(sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]) if len(sys.argv)>4 else 48,int(sys.argv[5]) if len(sys.argv)>5 else 1024)
