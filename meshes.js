// World axes: x along the baseline-to-baseline playing plane, y up, z toward the stands' open side.
const yaw = 13 * Math.PI / 180, pitch = 13 * Math.PI / 180;
const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
const roll = Math.atan2(sy * sp, cy);
const cr = Math.cos(roll), sr = Math.sin(roll);
export function project(x, y, z = 0) {
  const forward = x * sy + z * cy;
  const horizontal = x * cy - z * sy, vertical = forward * sp - y * cp;
  return [horizontal * cr + vertical * sr, vertical * cr - horizontal * sr, forward * cp + y * sp];
}

function lathe(profile, sides, color) {
  const faces = [];
  const vertex = (r, h, i) => [r * Math.cos(i * 2 * Math.PI / sides), h, r * Math.sin(i * 2 * Math.PI / sides)];
  for (let j = 1; j < profile.length; j++) {
    const [ra, ya] = profile[j-1], [rb, yb] = profile[j];
    for (let i = 0; i < sides; i++) {
      const a = vertex(ra, ya, i), b = vertex(rb, yb, i), c = vertex(rb, yb, i+1), d = vertex(ra, ya, i+1);
      const ink = typeof color === 'function' ? color(i,j) : color;
      if (ra) faces.push([a,b,d,ink]);
      if (rb) faces.push([b,c,d,ink]);
    }
  }
  return faces;
}
const sphere = [[0,-1],[0.71,-0.71],[1,0],[0.71,0.71],[0,1]];
const body = lathe([[1,0],[0.94,0.34],[0.73,0.68],[0.4,0.92],[0,1]],12);
const eye = lathe(sphere,8,'#fff4de'), pupil = lathe(sphere,8,'#1d2636');
const band = lathe([[0.78,0.63],[0.68,0.75]],12,'#f3e8cf');
const brim = lathe([[0,0],[1,0],[1,0.8],[0,1]],8,'#403452');
const crown = lathe([[1,0],[0.86,1],[0,1]],8,'#624468');
const horn = lathe([[1,0],[0.55,0.6],[0,1]],5,'#ffe4af');
const crest = lathe([[1,0],[0,1]],4,'#ffbe42');
const lid = lathe([[1,0],[0.85,0.52],[0,1]],8);
const ball = lathe(sphere,10,(i,j)=> ['#fff0c5','#ef8947','#50687b','#fff0c5','#fff0c5'][(i+j)%5]);

function addFaces(list, mesh, map, base, darken = 1, palette) {
  for (const [v1,v2,v3,ink] of mesh) {
    const [a,b,c] = [map(v1),map(v2),map(v3)];
    const u=b.map((v,i)=>v-a[i]), v=c.map((n,i)=>n-a[i]);
    const nx=u[1]*v[2]-u[2]*v[1], ny=u[2]*v[0]-u[0]*v[2], nz=u[0]*v[1]-u[1]*v[0];
    if (project(nx,ny,nz)[2] <= 0) continue;
    const light = darken*(0.65+0.50*(-0.48*nx+0.74*ny+0.46*nz)/Math.hypot(nx,ny,nz));
    const material = palette?.[ink] || ink || base;
    const n=parseInt(material.slice(1),16);
    const channel = shift => Math.min(255,Math.round(((n>>shift)&255)*light));
    const pts=[a,b,c].map(p=>project(...p));
    list.push({pts,depth:(pts[0][2]+pts[1][2]+pts[2][2])/3, color:'rgb('+[channel(16),channel(8),channel(0)]+')'});
  }
}
function paint(ctx, faces) {
  faces.sort((a,b)=>a.depth-b.depth);
  for (const {pts:[a,b,c],color} of faces) {
    ctx.fillStyle=color; ctx.strokeStyle=color; ctx.lineWidth=0.48;
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}
export function slime(ctx,look,side,squash,char,aimX,aimY) {
  const faces=[], dir=side?-1:1;
  function part(mesh,x,y,z,w,h,d) {
    addFaces(faces,mesh,([a,b,c])=>[(x+a*w)*(1+squash),(y+b*h)*(1-squash),(z+c*d)*(1+squash)],look.color,mesh===body?1-Math.min(0.7,char||0):1);
  }
  part(body,0,0,0,46,46,46);
  if(look.acc==='band') part(band,0,0,0,47,46,47);
  if(look.acc==='hat') { part(brim,-dir*4,43,0,21,4,20); part(crown,-dir*4,46,0,14,21,14); }
  if(look.acc==='horns') for(const z of [-19,19]) part(horn,0,38,z,7,22,7);
  if(look.acc==='mohawk') for(const x of [-18,-6,6,18]) part(crest,x,39,0,9,22-Math.abs(x)/3,6);
  for(const z of [-24,24]) {
    part(eye,dir*29,23,z,10,11,10);
    part(pupil,dir*29+aimX*5,23+aimY*5,z+8,4,5,3);
    if(look.acc==='lid') part(lid,dir*29,25,z,11,10,11);
  }
  paint(ctx,faces);
}
export function volleyball(ctx,r,angle,fire) {
  const faces=[], co=Math.cos(angle), si=Math.sin(angle);
  const palette = fire ? {'#fff0c5':'#ffe491','#ef8947':'#ff9b24','#50687b':'#de5830'} : null;
  addFaces(faces,ball,([x,y,z])=>[(x*co-y*si)*r,(x*si+y*co)*r,z*r],null,1,palette);
  paint(ctx,faces);
}
