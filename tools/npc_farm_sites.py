"""Find the 9 NPC farm sites (src/game.js NPC_FARMS): spots near each target with no road within 22 m, a drivable road within 45 m,
no water, rail, footpath, point of interest or named area close by.   python3 tools/npc_farm_sites.py  (slow: ~30 s)"""
import json, math
d=json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'assets/maps/lagos_world.json')))
N=d['nodes']; E=d['edges']
segs=[]
for k in range(0,len(E),7):
    a,b,c,w=E[k:k+4]; f=E[k+5]; segs.append((N[a*2],N[a*2+1],N[b*2],N[b*2+1],w/2,bool(f&8)))
def sd(x,z,x0,z0,x1,z1):
    dx,dz=x1-x0,z1-z0; L=math.hypot(dx,dz) or .01; t=max(0,min(L,((x-x0)*dx+(z-z0)*dz)/L)); return math.hypot(x-x0-dx/L*t,z-z0-dz/L*t)
def poly_d(x,z,p):
    return min(sd(x,z,p[i],p[i+1],p[i+2],p[i+3]) for i in range(0,len(p)-3,2)) if len(p)>=4 else 1e9
lines=[(w['p'],25) for w in d['water']]+[(r['p'],35) for r in d['rail']]+[(f['p'],12) for f in d['foot']]
pois=[(p[0],p[1]) for v in d['pois'].values() for p in v if isinstance(p,list) and len(p)>=2 and isinstance(p[0],(int,float))]
def inpoly(x,z,p):
    c=False; n=len(p)//2
    for i in range(n):
        x0,z0,x1,z1=p[2*i],p[2*i+1],p[2*((i+1)%n)],p[2*((i+1)%n)+1]
        if (z0>z)!=(z1>z) and x<(x1-x0)*(z-z0)/(z1-z0)+x0: c=not c
    return c
def ell(x,z,cx,cz,rx,rz): return ((x-cx)/rx)**2+((z-cz)/rz)**2<1
def ok(x,z):
    if abs(z)>1600: return None
    if -1700<x<-1640 or x>1600 or x<-4750: return None
    if ell(x,z,1480,-1470,260,250) or ell(x,z,-3330,-1095,340,290) or math.hypot(x+4331,z-831)<480: return None
    m=min(sd(x,z,*s[:4])-s[4] for s in segs)
    if m<22: return None
    md=min(sd(x,z,*s[:4])-s[4] for s in segs if s[5])
    if md>45: return None
    m=md
    for p,r in lines:
        if poly_d(x,z,p)<r: return None
    for px,pz in pois:
        if math.hypot(px-x,pz-z)<40: return None
    for a in d['areas']:
        if inpoly(x,z,a['p']): return None
    return m
T=[(-1150,-1150),(150,-1250),(-1150,100),(1250,250),(-700,1250),(700,1200),(-2500,-700),(-2400,1100),(-3600,200)]
out=[]
for tx,tz in T:
    best=None
    for r in range(0,420,12):
        for k in range(max(1,int(2*math.pi*r/12))):
            a=k/max(1,int(2*math.pi*r/12))*2*math.pi; x,z=tx+math.cos(a)*r,tz+math.sin(a)*r
            m=ok(x,z)
            if m is not None: best=(round(x),round(z),round(m,1)); break
        if best: break
    print((tx,tz),'->',best); out.append(best)
json.dump(out,open('sites.json','w'))
