import math
def _sub(a,b): return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def _dot(a,b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def _cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def _norm(a):
    l=math.sqrt(_dot(a,a)) or 1; return (a[0]/l,a[1]/l,a[2]/l)
def lightmap_uv(normals, fverts, adj, size=2048, pad_px=5, angle=35):
    """normals[f], fverts[f]=list of (x,y,z), adj[f]=neighbour faces -> uvs[f]=list of (u,v)"""
    n=len(normals); cosl=math.cos(math.radians(angle)); seen=[False]*n; charts=[]
    for s in range(n):
        if seen[s]: continue
        n0=normals[s]; seen[s]=True; st=[s]; ch=[]
        while st:
            f=st.pop(); ch.append(f)
            for g in adj[f]:
                if not seen[g] and _dot(normals[g],n0)>cosl: seen[g]=True; st.append(g)
        a=(1,0,0) if abs(n0[0])<.9 else (0,1,0); u=_norm(_cross(n0,a)); v=_cross(n0,u)
        pts={f:[(_dot(p,u),_dot(p,v)) for p in fverts[f]] for f in ch}
        xs=[q[0] for f in ch for q in pts[f]]; ys=[q[1] for f in ch for q in pts[f]]
        x0,y0=min(xs),min(ys); w,h=max(max(xs)-x0,1e-4),max(max(ys)-y0,1e-4)
        rot=h>w
        if rot: w,h=h,w
        charts.append([ch,pts,x0,y0,w,h,rot])
    A=sum(c[4]*c[5] for c in charts); W=math.sqrt(A)*1.1
    order=sorted(range(len(charts)),key=lambda i:-charts[i][5])
    for it in range(60):
        pad=pad_px/size*W; x=y=rowh=0; pos={}
        for i in order:
            w,h=charts[i][4]+pad,charts[i][5]+pad
            if x+w>W: x=0; y+=rowh; rowh=0
            pos[i]=(x+pad/2,y+pad/2); x+=w; rowh=max(rowh,h)
        if y+rowh<=W: break
        W*=1.04
    uvs=[None]*n
    for i,(ch,pts,x0,y0,w,h,rot) in enumerate(charts):
        px,py=pos[i]
        for f in ch:
            out=[]
            for (a,b) in pts[f]:
                a-=x0; b-=y0
                if rot: a,b=b,h-a
                out.append(((px+a)/W,(py+b)/W))
            uvs[f]=out
    return uvs, len(charts), A/(W*W), W
