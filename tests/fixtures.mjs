// Independent raster oracle: inverse-project each pixel, then test ideal circles.
// No production rendering or homography code is used here.
export function raster(bits, options = {}) {
  const w = options.width || 320, h = options.height || 260;
  const angle = options.angle || 0, size = options.size || 42;
  const c = Math.cos(angle), s = Math.sin(angle);
  const tx = options.tx ?? 150, ty = options.ty ?? 130;
  const px = options.px || 0, py = options.py || 0;
  const mat = [size*c, -size*s, tx, size*s, size*c, ty, px, py, 1];
  const [a,b,c0,d,e,f,g,hh,i] = mat;
  const inv = [e*i-f*hh,c0*hh-b*i,b*f-c0*e,f*g-d*i,a*i-c0*g,c0*d-a*f,d*hh-e*g,b*g-a*hh,a*e-b*d];
  const data = new Uint8ClampedArray(w*h*4);
  const dots = [[-2,-2],[0,-2],[2,-2],[-2,2],[2,2]];
  for(let n=0;n<9;n++) if(bits & 1<<n) dots.push([n%3-1,Math.floor(n/3)-1]);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const z=inv[6]*x+inv[7]*y+inv[8];
    const u=(inv[0]*x+inv[1]*y+inv[2])/z,v=(inv[3]*x+inv[4]*y+inv[5])/z;
    let value=options.dark ?? 8;
    if(dots.some(([dx,dy])=>(u-dx)**2+(v-dy)**2<.175**2)) value=options.light ?? 240;
    if(options.clutter && ((x-25)**2+(y-30)**2<6**2 || (x-290)**2+(y-220)**2<7**2)) value=220;
    const k=(y*w+x)*4; data[k]=data[k+1]=data[k+2]=value;data[k+3]=255;
  }
  return {data,width:w,height:h};
}
