// LAST STEP before launch (Mr. Robot's call): sharp upscale for phones, like AMD FSR 1. Not loaded by the game yet.
// The game draws smaller than the screen on phones (pixel ratio 0.6–1.25); instead of letting the browser stretch it,
// draw the scene into a small target, then: pass 1 = Catmull-Rom upscale to full size, pass 2 = RCAS sharpening to the screen.
// Tone mapping / sRGB must be applied before these passes (they work on the final colours). Tested look: README "Last step".
export const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
// uniforms: tex (the small picture, LinearFilter), ts (its size in pixels)
export const UPSCALE = `
    uniform sampler2D tex; uniform vec2 ts; varying vec2 vUv;
    void main(){ vec2 sp=vUv*ts, t1=floor(sp-.5)+.5, f=sp-t1;
      vec2 w0=f*(-.5+f*(1.-.5*f)), w1=1.+f*f*(-2.5+1.5*f), w2=f*(.5+f*(2.-1.5*f)), w3=f*f*(-.5+.5*f), w12=w1+w2;
      vec2 t0=(t1-1.)/ts, t3=(t1+2.)/ts, t12=(t1+w2/w12)/ts; vec4 c=vec4(0.);
      c+=texture2D(tex,vec2(t0.x,t0.y))*w0.x*w0.y; c+=texture2D(tex,vec2(t12.x,t0.y))*w12.x*w0.y; c+=texture2D(tex,vec2(t3.x,t0.y))*w3.x*w0.y;
      c+=texture2D(tex,vec2(t0.x,t12.y))*w0.x*w12.y; c+=texture2D(tex,vec2(t12.x,t12.y))*w12.x*w12.y; c+=texture2D(tex,vec2(t3.x,t12.y))*w3.x*w12.y;
      c+=texture2D(tex,vec2(t0.x,t3.y))*w0.x*w3.y; c+=texture2D(tex,vec2(t12.x,t3.y))*w12.x*w3.y; c+=texture2D(tex,vec2(t3.x,t3.y))*w3.x*w3.y;
      gl_FragColor=vec4(clamp(c.rgb,0.,1.),1.); }`;
// uniforms: tex (the upscaled picture), px (1/size of the screen), con (sharpness: 2^-0.25 ≈ 0.84)
export const RCAS = `
    uniform sampler2D tex; uniform vec2 px; uniform float con; varying vec2 vUv;
    void main(){ vec3 b=texture2D(tex,vUv+vec2(0.,-px.y)).rgb, dd=texture2D(tex,vUv+vec2(-px.x,0.)).rgb, e=texture2D(tex,vUv).rgb, f=texture2D(tex,vUv+vec2(px.x,0.)).rgb, h=texture2D(tex,vUv+vec2(0.,px.y)).rgb;
      vec3 mn4=min(min(b,dd),min(f,h)), mx4=max(max(b,dd),max(f,h));
      vec3 hitMin=mn4/(4.*mx4+1e-4), hitMax=(1.-mx4)/(4.*mn4-4.-1e-4), lobeRGB=max(-hitMin,hitMax);
      float lobe=max(-.1875,min(max(lobeRGB.r,max(lobeRGB.g,lobeRGB.b)),0.))*con;
      gl_FragColor=vec4((lobe*(b+dd+h+f)+e)/(4.*lobe+1.),1.); }`;
