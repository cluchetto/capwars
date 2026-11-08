export const DISTANCE_POWER=2;
const R=Math.PI/180;
// Scores are compared in log space: log(sqrt(cap) / distance²).
// Subtracting a shared reference keeps the shader values small without changing winners.
export function influenceWeights(caps){
  if(!caps.length||caps.some(c=>!Number.isFinite(c)||c<=0))throw Error('Invalid market capitalizations');
  const reference=Math.log(Math.max(...caps));return caps.map(c=>.5*(Math.log(c)-reference));
}
export function vector(lat,lon){return [Math.cos(lat*R)*Math.cos(lon*R),Math.sin(lat*R),Math.cos(lat*R)*Math.sin(lon*R)];}
export class InfluenceEngine {
  constructor(grid,width,height,countries,factions){
    this.grid=grid;this.width=width;this.height=height;this.countries=countries;this.factions=factions;
    this.indices=[];this.weights=[];this.costs=[];this.total=0;this.bias=new Float64Array(factions.length);
    const origins=factions.map(f=>vector(f.lat,f.lon));
    for(let p=0;p<grid.length;p++)if(grid[p]){
      const y=Math.floor(p/width),x=p%width,lat=90-(y+.5)*180/height,lon=-180+(x+.5)*360/width,v=vector(lat,lon);
      const weight=Math.cos(lat*R);this.indices.push(p);this.weights.push(weight);this.total+=weight;
      for(const s of origins)this.costs.push(Math.log(Math.max(1e-6,Math.acos(Math.max(-1,Math.min(1,v[0]*s[0]+v[1]*s[1]+v[2]*s[2]))))));
    }
    this.costs=new Float32Array(this.costs);this.weights=new Float32Array(this.weights);
    this.indices=new Uint32Array(this.indices);this.assign=new Uint8Array(this.indices.length);
  }
  solve(caps){
    if(caps.length!==this.factions.length)throw Error('One market capitalization is required per faction');
    const n=caps.length,totals=new Float64Array(n);
    this.bias.set(influenceWeights(caps));
    // Angular great-circle distance differs from kilometers by a shared constant.
    // The small distance floor is also used by the renderer at a capital itself.
    for(let p=0;p<this.indices.length;p++){
      let winner=0,best=-Infinity;
      for(let j=0;j<n;j++){const score=this.bias[j]-DISTANCE_POWER*this.costs[p*n+j];if(score>best){best=score;winner=j;}}
      this.assign[p]=winner;totals[winner]+=this.weights[p];
    }
    const pixels=new Uint8Array(this.grid.length),countryAreas=Array.from({length:this.countries.length+1},()=>new Float64Array(n));
    for(let p=0;p<this.indices.length;p++){
      const idx=this.indices[p],owner=this.assign[p];pixels[idx]=owner+1;countryAreas[this.grid[idx]][owner]+=this.weights[p];
    }
    const countryShares=countryAreas.map(a=>{const sum=a.reduce((x,y)=>x+y,0);return [...a].map(v=>sum?v/sum:0);});
    return {pixels,bias:[...this.bias],actual:[...totals].map(v=>v/this.total),countryShares};
  }
}
