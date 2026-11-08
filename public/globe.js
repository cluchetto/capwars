import {vector,DISTANCE_POWER} from './engine.js';
const vertex=`attribute vec2 a;varying vec2 uv;void main(){uv=a;gl_Position=vec4(a,0.,1.);}`;
const fragment=(count)=>`precision highp float;
varying vec2 uv;uniform vec2 resolution;uniform vec3 rightAxis,upAxis,frontAxis;uniform sampler2D mapTex;uniform float zoom,selected,layer;uniform vec3 colors[${count}],origins[${count}];uniform float biases[${count}];uniform vec2 texel;
vec3 faction(float id){${Array.from({length:count},(_,i)=>`if(id<${i+1.5})return colors[${i}];`).join('')}return colors[0];}
void main(){vec2 q=uv*resolution/min(resolution.x,resolution.y)*1.15/zoom;float r2=dot(q,q);
if(r2>1.){float halo=exp(-(sqrt(r2)-1.)*22.);gl_FragColor=vec4(vec3(.12,.25,.34)*halo*.35,halo*.35);return;}
float z=sqrt(1.-r2);vec3 p=rightAxis*q.x+upAxis*q.y+frontAxis*z;
float lon=atan(p.z,p.x),lat=asin(clamp(p.y,-1.,1.));vec2 t=vec2(lon/6.2831853+.5,.5-lat/3.14159265);
vec4 data=texture2D(mapTex,t);float country=floor(data.r*255.+.5),id=floor(data.g*255.+.5);
if(layer<.5 && country>.5){float best=-1.0e20;for(int j=0;j<${count};j++){float distance=acos(clamp(dot(p,origins[j]),-1.,1.));float score=biases[j]-${DISTANCE_POWER.toFixed(1)}*log(max(distance,0.000001));if(score>best){best=score;id=float(j)+1.;}}}
vec3 ocean=vec3(.038,.080,.111);float gridLon=abs(fract((lon/3.14159265)*6.+.5)-.5),gridLat=abs(fract((lat/3.14159265)*12.+.5)-.5);
float graticule=max(1.-smoothstep(.002,.008,gridLon),1.-smoothstep(.002,.008,gridLat));
vec3 col=ocean+graticule*.022;
if(country>.5){col=id>.5?faction(id)*.67:vec3(.27,.31,.34);if(layer>.5)col=id>.5?faction(id)*.63:vec3(.27,.31,.34);
float border=0.;float frontier=0.;
vec4 east=texture2D(mapTex,t+vec2(texel.x,0.));vec4 north=texture2D(mapTex,t+vec2(0.,texel.y));
border=max(step(.002,abs(east.r-data.r)),step(.002,abs(north.r-data.r)));
frontier=0.;
col=mix(col,col*.40,border*.6);col=mix(col,vec3(.82,.87,.86),frontier*.55);
if(abs(country-selected)<.1)col=mix(col,vec3(1.,.9,.68),.48);
}
float light=.62+.38*max(0.,dot(vec3(q,z),normalize(vec3(-.5,.6,1.))));col*=light;
float rim=pow(1.-z,4.);col=mix(col,vec3(.19,.30,.36),rim*.48);
gl_FragColor=vec4(col,1.);
}`;
export class Globe {
 constructor(canvas,labels,onCountry,onFaction,factions){
  const FACTIONS=factions;this.factions=factions;
  this.canvas=canvas;this.labels=labels;this.onCountry=onCountry;this.onFaction=onFaction;this.lon=12;this.lat=16;this.zoom=1;this.selected=0;this.layer=0;this.auto=false;this.dirty=true;
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable. Try a browser with hardware acceleration.');this.gl=gl;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment(FACTIONS.length)));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(this.program,'a');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  this.uniforms={};for(const name of ['resolution','rightAxis','upAxis','frontAxis','zoom','selected','layer','colors','mapTex','origins','biases','texel'])this.uniforms[name]=gl.getUniformLocation(this.program,['colors','origins','biases'].includes(name)?name+'[0]':name);
  this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  const cols=FACTIONS.flatMap(f=>[1,3,5].map(i=>parseInt(f.color.slice(i,i+2),16)/255));gl.uniform3fv(this.uniforms.colors,new Float32Array(cols));
  this.buttons=FACTIONS.map((f,i)=>{const b=document.createElement('button');b.className='city-pin';b.style.setProperty('--faction',f.color);const dot=document.createElement('i'),label=document.createElement('span'),sub=document.createElement('small');label.textContent='★ '+f.city;sub.textContent=f.symbol;label.append(sub);b.append(dot,label);b.setAttribute('aria-label',`${f.name}, starting capital ${f.city}`);b.onclick=e=>{e.stopPropagation();onFaction(i);};labels.append(b);return b;});
  gl.uniform3fv(this.uniforms.origins,new Float32Array(FACTIONS.flatMap(f=>vector(f.lat,f.lon))));
  this.bind();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  let last=0;const frame=t=>{if(this.auto&&!this.drag){this.lon+=(Math.min(t-last,50)/1000)*2;this.dirty=true;}last=t;if(this.dirty)this.draw();this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
 }
 destroy(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
 resize(){const r=this.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);this.canvas.width=Math.round(r.width*d);this.canvas.height=Math.round(r.height*d);this.dirty=true;}
 axes(){const r=Math.PI/180,lon=this.lon*r,lat=this.lat*r;return {right:[-Math.sin(lon),0,Math.cos(lon)],up:[-Math.sin(lat)*Math.cos(lon),Math.cos(lat),-Math.sin(lat)*Math.sin(lon)],front:vector(this.lat,this.lon)};}
 setMap(grid,pixels,width,height,owners,layer=0,bias=[]){this.grid=grid;this.width=width;this.height=height;const rgba=new Uint8Array(grid.length*4);for(let i=0;i<grid.length;i++){rgba[i*4]=grid[i];rgba[i*4+1]=owners[grid[i]]>=0?owners[grid[i]]+1:0;rgba[i*4+3]=255;}const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,rgba);gl.uniform1fv(this.uniforms.biases,new Float32Array(bias));gl.uniform2f(this.uniforms.texel,1/width,1/height);this.layer=layer;this.dirty=true;}
 draw(){const FACTIONS=this.factions;const gl=this.gl,a=this.axes();gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.uniform2f(this.uniforms.resolution,this.canvas.width,this.canvas.height);gl.uniform3fv(this.uniforms.rightAxis,a.right);gl.uniform3fv(this.uniforms.upAxis,a.up);gl.uniform3fv(this.uniforms.frontAxis,a.front);gl.uniform1f(this.uniforms.zoom,this.zoom);gl.uniform1f(this.uniforms.selected,this.selected);gl.uniform1f(this.uniforms.layer,this.layer);gl.drawArrays(gl.TRIANGLES,0,6);
 const rect=this.canvas.getBoundingClientRect(),scale=Math.min(rect.width,rect.height)*this.zoom/2.3;for(let i=0;i<FACTIONS.length;i++){const v=vector(FACTIONS[i].lat,FACTIONS[i].lon),dot=b=>v.reduce((s,x,j)=>s+x*b[j],0),z=dot(a.front);const b=this.buttons[i];b.hidden=z<.12;b.style.left=`${rect.width/2+dot(a.right)*scale}px`;b.style.top=`${rect.height/2-dot(a.up)*scale}px`;}
 this.dirty=false;}
 pick(clientX,clientY){if(!this.grid)return 0;const r=this.canvas.getBoundingClientRect(),scale=Math.min(r.width,r.height)*this.zoom/2.3,x=(clientX-r.left-r.width/2)/scale,y=-(clientY-r.top-r.height/2)/scale,z2=1-x*x-y*y;if(z2<0)return 0;const a=this.axes(),z=Math.sqrt(z2),p=a.front.map((v,i)=>a.right[i]*x+a.up[i]*y+v*z),lon=Math.atan2(p[2],p[0])*180/Math.PI,lat=Math.asin(Math.max(-1,Math.min(1,p[1])))*180/Math.PI;return this.grid[Math.min(this.height-1,Math.floor((90-lat)/180*this.height))*this.width+Math.min(this.width-1,Math.floor((lon+180)/360*this.width))];}
 fly(lat,lon){this.lat=lat;this.lon=lon;this.auto=false;this.dirty=true;}
 bind(){const c=this.canvas; c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,lon:this.lon,lat:this.lat,moved:false};});c.addEventListener('pointermove',e=>{if(this.drag){const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.moved ||=Math.abs(dx)+Math.abs(dy)>5;this.lon=this.drag.lon-dx*.23/this.zoom;this.lat=Math.max(-80,Math.min(80,this.drag.lat+dy*.23/this.zoom));this.dirty=true;}else{const id=this.pick(e.clientX,e.clientY);c.style.cursor=id?'pointer':'grab';}});c.addEventListener('pointerup',e=>{if(this.drag&&!this.drag.moved){const id=this.pick(e.clientX,e.clientY);if(id)this.onCountry(id);}this.drag=null;});c.addEventListener('pointercancel',()=>this.drag=null);c.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.75,Math.min(1.65,this.zoom-e.deltaY*.0006));this.dirty=true;},{passive:false});c.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.lon+=e.key==='ArrowRight'?8:e.key==='ArrowLeft'?-8:0;this.lat=Math.max(-80,Math.min(80,this.lat+(e.key==='ArrowUp'?8:e.key==='ArrowDown'?-8:0)));this.dirty=true;}});}
}
