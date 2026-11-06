// Independent circle raster oracle; no production rendering code.
export function raster(banks,{strengths=[1,1],angle=0}={}){
 const width=440,height=440,data=new Uint8ClampedArray(width*height*4),dots=[[0,0,1],[3.5,0,1],[7,0,1],[7,7,1],[0,7,1]];let indices=[0,0];
 for(let y=0;y<6;y++)for(let x=0;x<6;x++){const bank=(x+y)%2,i=indices[bank]++;if(banks[bank]&(1<<i))dots.push([x+1,y+1,strengths[bank]]);}
 const c=Math.cos(angle),s=Math.sin(angle),pitch=38;
 const circles=dots.map(([x,y,a])=>({x:220+((x-3.5)*c-(y-3.5)*s)*pitch,y:220+((x-3.5)*s+(y-3.5)*c)*pitch,a}));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let v=8;for(const p of circles)if((x-p.x)**2+(y-p.y)**2<(pitch*.175)**2)v=8+232*p.a;const k=(y*width+x)*4;data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;}
 return {data,width,height};
}
