// Systematic Cauchy Reed-Solomon over GF(256), primitive polynomial 0x11d.
// Data rows are identity; repair row i has coefficient 1/(i XOR (8+j)).
const exp=new Uint8Array(512),log=new Uint8Array(256);let x=1;
for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&256)x^=0x11d;}
for(let i=255;i<512;i++)exp[i]=exp[i-255];
export const multiply=(a,b)=>a&&b?exp[log[a]+log[b]]:0;
const inverse=a=>{if(!a)throw Error('Singular recovery matrix');return exp[255-log[a]];};
export const repairsFor=k=>Math.max(1,Math.ceil(k/4),9-k);
function row(k,slot){const a=new Uint8Array(k);if(slot<k)a[slot]=1;else for(let j=0;j<k;j++)a[j]=inverse((slot-k)^(8+j));return a;}
function validate(k){if(!Number.isInteger(k)||k<1||k>32)throw Error('Invalid recovery group');}
export function encodeGroup(data){const k=data.length;validate(k);if(data.some(a=>a.length!==7))throw Error('Invalid data width');const out=data.map(a=>a.slice());for(let i=0;i<repairsFor(k);i++){const a=row(k,k+i),r=new Uint8Array(7);for(let j=0;j<k;j++)for(let b=0;b<7;b++)r[b]^=multiply(a[j],data[j][b]);out.push(r);}return out;}
export function recoverGroup(k,units){validate(k);if(units.size<k)return null;const chosen=[...units].filter(([i,b])=>Number.isInteger(i)&&i>=0&&i<k+repairsFor(k)&&b.length===7).sort((a,b)=>a[0]-b[0]).slice(0,k);if(chosen.length<k)return null;
 const a=chosen.map(([slot,bytes])=>{const r=new Uint8Array(k+7);r.set(row(k,slot));r.set(bytes,k);return r;});
 for(let c=0;c<k;c++){let pivot=c;while(pivot<k&&!a[pivot][c])pivot++;if(pivot===k)return null;[a[c],a[pivot]]=[a[pivot],a[c]];const inv=inverse(a[c][c]);for(let j=c;j<k+7;j++)a[c][j]=multiply(a[c][j],inv);for(let r=0;r<k;r++)if(r!==c){const f=a[r][c];if(f)for(let j=c;j<k+7;j++)a[r][j]^=multiply(f,a[c][j]);}}
 return a.map(r=>r.slice(k));
}
