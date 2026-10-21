# Textures for the carton bed: three flattened boxes (kraft board, faded print, tape, dirt), the corrugated edge,
# an ankara wrapper (the folded pillow) and rubber slippers. One 2048 atlas.
import numpy as np, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
rng=np.random.default_rng(7); random.seed(7)
S=2048; A=Image.new('RGB',(S,S))
FB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; FC='/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
def noise(w,h,scale,oct=4):
    out=np.zeros((h,w)); amp=1; tot=0
    for o in range(oct):
        sw,sh=max(2,int(w/scale*2**o)),max(2,int(h/scale*2**o)); n=rng.random((sh,sw))
        out+=np.array(Image.fromarray((n*255).astype(np.uint8)).resize((w,h),Image.BICUBIC))/255*amp; tot+=amp; amp*=.5
    return out/tot
def kraft(w,h,tone):
    base=np.array(tone,float)[None,None,:]*np.ones((h,w,3))
    n=noise(w,h,180); f=noise(w,h,12,2)
    img=base*(0.86+0.22*n[...,None])*(0.95+0.08*f[...,None])
    # the corrugation shows through the liner: faint stripes every ~8 mm (1 px ~ 1 mm)
    y=np.arange(h)[:,None]; img*=(1+0.025*np.sin(y/8*2*math.pi))[...,None]
    # paper fibres
    fib=(rng.random((h,w))>0.996).astype(float); fib=np.array(Image.fromarray((fib*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6)))/255
    img*=(1-0.25*fib[...,None]); return Image.fromarray(np.clip(img,0,255).astype(np.uint8))
def dirt(im,k=1.0,seed=0):
    w,h=im.size; a=np.array(im).astype(float); n=noise(w,h,90,5)
    m=np.clip((n-0.55)*3.2,0,1)*0.45*k; a*=(1-m[...,None]*np.array([.55,.6,.7]))     # grime patches
    # a water stain ring
    cx,cy,r=rng.integers(w//4,3*w//4),rng.integers(h//4,3*h//4),rng.integers(min(w,h)//7,min(w,h)//4)
    yy,xx=np.mgrid[:h,:w]; d=np.hypot(xx-cx,yy-cy)*(1+0.15*noise(w,h,60)); ring=np.exp(-((d-r)/7)**2)*.35+np.clip(1-d/r,0,1)*.1
    a*=(1-ring[...,None]*np.array([.35,.42,.5]))
    # edges worn darker and scuffed
    e=np.minimum(np.minimum(xx,w-1-xx),np.minimum(yy,h-1-yy)); a*=(0.78+0.22*np.clip(e/40,0,1))[...,None]
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8))
def faded(d,xy,text,font,fill,anchor='mm',angle=0,img=None):
    # print that has rubbed off in places
    w,h=img.size; L=Image.new('L',(w,h)); dl=ImageDraw.Draw(L); dl.text(xy,text,font=font,fill=255,anchor=anchor)
    if angle: L=L.rotate(angle,center=xy)
    m=np.array(L)/255*(0.55+0.45*noise(w,h,40)); m=np.clip(m*1.15-0.1,0,1)
    a=np.array(img).astype(float); c=np.array(fill,float); a=a*(1-m[...,None]*.85)+c*m[...,None]*.85; return Image.fromarray(a.astype(np.uint8))
def tape(img,box):
    x0,y0,x1,y1=box; a=np.array(img).astype(float); h=y1-y0; w=x1-x0; n=noise(w,h,20,3)
    t=np.array([176,128,72],float)*(0.9+0.2*n[...,None]); gloss=(np.sin(np.arange(w)/9)[None,:]*0.04)
    t*=1+gloss[...,None]; a[y0:y1,x0:x1]=a[y0:y1,x0:x1]*0.15+t*0.85; return Image.fromarray(np.clip(a,0,255).astype(np.uint8))
def crease(img,x=None,y=None):
    a=np.array(img).astype(float); h,w=a.shape[:2]
    if x is not None: idx=np.arange(w); k=np.exp(-((idx-x)/3)**2)*.3; a*=(1-k)[None,:,None]
    if y is not None: idx=np.arange(h); k=np.exp(-((idx-y)/3)**2)*.3; a*=(1-k)[:,None,None]
    return Image.fromarray(a.astype(np.uint8))
f_big=ImageFont.truetype(FB,120); f_mid=ImageFont.truetype(FC,74); f_sm=ImageFont.truetype(FC,40)
# sheet 1: FRAGILE, arrows
s1=kraft(1024,1024,(176,134,88)); s1=faded(None,(512,300),'FRAGILE',f_big,(170,30,25),img=s1); s1=faded(None,(512,430),'HANDLE WITH CARE',f_mid,(30,26,22),img=s1)
d=Image.new('L',(1024,1024)); 
s1=faded(None,(250,760),'↑ ↑',ImageFont.truetype(FB,150),(30,26,22),img=s1); s1=faded(None,(250,860),'THIS SIDE UP',f_sm,(30,26,22),img=s1)
s1=tape(s1,(0,488,1024,548)); s1=crease(s1,x=700); s1=dirt(s1,1.0)
# sheet 2: a noodles carton (made-up brand)
s2=kraft(1024,1024,(168,126,80)); s2=faded(None,(512,250),'OGA GOLD',ImageFont.truetype(FB,130),(200,40,30),img=s2)
s2=faded(None,(512,390),'INSTANT NOODLES · 40 x 70g',f_sm,(40,34,28),img=s2); s2=faded(None,(512,760),'CHICKEN FLAVOUR',f_mid,(205,150,20),img=s2)
s2=faded(None,(840,900),'MADE IN NIGERIA',f_sm,(40,34,28),img=s2); s2=tape(s2,(470,0,535,1024)); s2=crease(s2,y=600); s2=dirt(s2,1.3)
# sheet 3: plain, a bit wet once, a phone number in marker
s3=kraft(1024,512,(181,140,94)); s3=faded(None,(330,170),'KEEP DRY',f_mid,(35,30,25),img=s3); s3=faded(None,(330,250),'☂',ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',90),(35,30,25),img=s3)
s3=faded(None,(760,380),'ABOKI 0803...',ImageFont.truetype(FC,52),(20,20,60),angle=-8,img=s3); s3=crease(s3,x=520); s3=dirt(s3,1.5)
# corrugated edge: the wavy flute between two liners (seen on the cut edges)
w,h=1024,512; e=np.zeros((h,w,3)); xx=np.arange(w)[None,:]; yy=np.arange(h)[:,None]
liner=np.broadcast_to(np.abs((yy%64)-32)>26,(h,w)); wave=np.abs(((yy%64)-32)/26-np.sin(xx/9.0)*0.8)<0.18
e[:]=np.array([150,110,70]); e[liner]=np.array([170,128,82]); e[wave&~liner]=np.array([190,150,100]); e[(~liner)&(~wave)]=np.array([70,50,32])
edge=Image.fromarray(e.astype(np.uint8)).filter(ImageFilter.GaussianBlur(.7))
# ankara wrapper: bold circles and leaves, a bit faded and creased
w,h=1024,512; an=Image.new('RGB',(w,h),(24,70,140)); dr=ImageDraw.Draw(an)
for j in range(0,h+64,96):
    for i in range(0,w+64,96):
        o=48 if (j//96)%2 else 0; cx,cy=i+o,j
        dr.ellipse((cx-34,cy-34,cx+34,cy+34),fill=(236,160,30)); dr.ellipse((cx-22,cy-22,cx+22,cy+22),fill=(190,40,40)); dr.ellipse((cx-9,cy-9,cx+9,cy+9),fill=(245,235,210))
        dr.polygon([(cx+48,cy-10),(cx+70,cy),(cx+48,cy+10),(cx+26,cy)],fill=(30,140,90))
a=np.array(an).astype(float)*(0.82+0.25*noise(w,h,70)[...,None]); fold=np.exp(-((np.arange(h)[:,None]-256)/5)**2)*.35; a*=(1-fold)[...,None]
ank=Image.fromarray(np.clip(a,0,255).astype(np.uint8))
# slippers: blue rubber with a worn sole, white straps
w,h=512,512; sl=np.array(Image.new('RGB',(w,h),(40,90,170))).astype(float)*(0.85+0.25*noise(w,h,40)[...,None]); sl[:h//2]=np.array([235,235,230])*(0.8+0.2*noise(w,h//2,30)[...,None])
slip=Image.fromarray(np.clip(sl,0,255).astype(np.uint8))
# black nylon bag
w,h=512,512; ny=np.ones((h,w,3))*30*(0.7+0.8*noise(w,h,25)[...,None]); ny+=np.clip(noise(w,h,15)-0.6,0,1)[...,None]*180
nyl=Image.fromarray(np.clip(ny,0,255).astype(np.uint8))
A.paste(s1,(0,0)); A.paste(s2,(1024,0)); A.paste(s3,(0,1024)); A.paste(edge,(1024,1024)); A.paste(ank,(0,1536)); A.paste(slip,(1024,1536)); A.paste(nyl,(1536,1536))
A.save('/mnt/user-data/outputs/carton/carton_atlas.jpg',quality=90); A.resize((1024,1024)).save('/tmp/claude-0/carton_prev.jpg')
print('ok')
