// Geometry and import functions shared by the editor and its verification script.
export const identity = [1, 0, 0, 1, 0, 0];
export const clone = value => structuredClone(value);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const uid = prefix => `${prefix}${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export const point = (m, x, y) => ({x:m[0]*x+m[2]*y+m[4], y:m[1]*x+m[3]*y+m[5]});
export function bounds(nodes) {
  if (!nodes.length) return {x:0,y:0,w:1000,h:700};
  const x=Math.min(...nodes.map(n=>n.x)), y=Math.min(...nodes.map(n=>n.y));
  return {x,y,w:Math.max(...nodes.map(n=>n.x+n.w))-x,h:Math.max(...nodes.map(n=>n.y+n.h))-y};
}
export function rectDistance(n,p) { return Math.hypot(Math.max(n.x-p.x,0,p.x-n.x-n.w),Math.max(n.y-p.y,0,p.y-n.y-n.h)); }
export const contains = (r,p,pad=0) => p.x>=r.x-pad && p.x<=r.x+r.w+pad && p.y>=r.y-pad && p.y<=r.y+r.h+pad;
export function descendants(graph,id) {
  const found=new Set([id]), queue=[id];
  while(queue.length){const cur=queue.shift();for(const e of graph.edges)if(e.source===cur&&!found.has(e.target)){found.add(e.target);queue.push(e.target);}}
  return found;
}
export function ports(a,b) {
  const ac={x:a.x+a.w/2,y:a.y+a.h/2}, bc={x:b.x+b.w/2,y:b.y+b.h/2};
  const dx=bc.x-ac.x,dy=bc.y-ac.y;
  function onRect(n,c,dx,dy){const s=1/Math.max(Math.abs(dx)/(n.w/2),Math.abs(dy)/(n.h/2),.001);return {x:c.x+dx*s,y:c.y+dy*s};}
  return {a:onRect(a,ac,dx,dy),b:onRect(b,bc,-dx,-dy)};
}
export function curve(a,b) {
  const p=ports(a,b),dx=p.b.x-p.a.x,dy=p.b.y-p.a.y;
  const c1=Math.abs(dx)>Math.abs(dy)?{x:p.a.x+dx*.55,y:p.a.y}:{x:p.a.x,y:p.a.y+dy*.55};
  const c2=Math.abs(dx)>Math.abs(dy)?{x:p.b.x-dx*.55,y:p.b.y}:{x:p.b.x,y:p.b.y-dy*.55};
  return {start:p.a,end:p.b,c1,c2,path:`M${p.a.x} ${p.a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.b.x} ${p.b.y}`};
}
export function wrapText(text,maxWidth,fontSize,measure) {
  const lines=[];
  const width=measure || (s=>Array.from(s).reduce((a,c)=>a+(/[MW@]/.test(c)?.85:/[il.,' ]/.test(c)?.28:.53)*fontSize,0));
  for(const paragraph of String(text).split('\n')){
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)){
      if(width(word)>maxWidth){
        if(line){lines.push(line);line='';}
        let part='';
        for(const ch of word){if(part&&width(part+ch)>maxWidth){lines.push(part);part='';}part+=ch;}
        line=part;
      }else if(line&&width(line+' '+word)>maxWidth){lines.push(line);line=word;}else line+=(line?' ':'')+word;
    }
    lines.push(line);
  }
  return lines;
}
export function layoutText(n,measure) {
  const size=clamp(n.fontSize||12,3,100),pad=Math.min(14,n.w*.08),lines=wrapText(n.text||n.title||'Topic',n.w-pad*2,size,measure);
  return {size,pad,lines,lineHeight:size*1.4,height:pad*2+lines.length*size*1.4};
}
export function validateProject(value) {
  if(!value || value.schema!=='maploom/1' || !Array.isArray(value.nodes) || !Array.isArray(value.edges))throw new Error('Choose a Maploom project file (.maploom or .json).');
  if(value.nodes.length>4000||value.edges.length>10000)throw new Error('This project is too large. Use fewer than 4,000 topics and 10,000 connections.');
  const ids=new Set();
  const hex=(v,fallback)=>/^#[\da-f]{6}$/i.test(v)?v:fallback;
  const nodes=value.nodes.map(n=>{
    if(typeof n.id!=='string'||ids.has(n.id)||!['x','y','w','h'].every(k=>Number.isFinite(n[k]))||n.w<1||n.h<1||Math.abs(n.x)>1e7||Math.abs(n.y)>1e7||n.w>1e6||n.h>1e6)throw new Error('The project contains invalid topic geometry.');
    ids.add(n.id);
    const out={id:n.id,x:n.x,y:n.y,w:n.w,h:n.h,title:String(n.title||'Topic').slice(0,200),text:String(n.text||'').slice(0,12000),color:hex(n.color,'#6f8b50'),fill:hex(n.fill,'#ffffff'),fontSize:clamp(Number(n.fontSize)||12,3,100),kind:String(n.kind||'topic')};
    if(Array.isArray(n.items)&&n.items.length<3000)out.items=n.items.filter(t=>typeof t.text==='string'&&['x','y','size'].every(k=>Number.isFinite(t[k]))).map(t=>({text:t.text.slice(0,12000),x:t.x,y:t.y,size:clamp(t.size,.5,1000),bold:!!t.bold,color:hex(t.color,'#30432e')}));
    return out;
  });
  const edges=value.edges.filter(e=>e&&ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target).map((e,i)=>({id:`edge-${i}`,source:e.source,target:e.target,color:hex(e.color,'#819865')}));
  const out={schema:'maploom/1',title:String(value.title||'Untitled map').slice(0,200),nodes,edges,page:{width:Number(value.page?.width)||1800,height:Number(value.page?.height)||1305},sourcePage:Number(value.sourcePage)||1};
  if(typeof value.sourceUrl==='string'&&value.sourceUrl==='./assets/sample.pdf')out.sourceUrl=value.sourceUrl;
  if(typeof value.sourceData==='string'&&value.sourceData.length<36_000_000&&/^[A-Za-z0-9+/=]+$/.test(value.sourceData))out.sourceData=value.sourceData;
  return out;
}
function colorHex(values,fallback='#6d805d') {
  if(!values||values.length<3)return fallback;
  return '#'+Array.from(values).slice(0,3).map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
}
function cmykHex(values){const [c,m,y,k]=values;return colorHex([255*(1-c)*(1-k),255*(1-m)*(1-k),255*(1-y)*(1-k)]);}
// PDF path geometry is converted to viewport coordinates; graph semantics are inferred.
export async function extractMap(page,pdfjs) {
  const OPS=pdfjs.OPS,viewport=page.getViewport({scale:1});
  const [content,operators]=await Promise.all([page.getTextContent(),page.getOperatorList()]);
  const texts=content.items.filter(i=>i.str?.trim()).map(i=>{
    const m=multiply(viewport.transform,i.transform),size=Math.hypot(m[2],m[3]),style=content.styles[i.fontName]||{},ascent=style.ascent||.8;
    return {text:i.str.normalize('NFKC'),x:m[4],y:m[5],size,bold:/bold|black|heavy/i.test(i.fontName+' '+style.fontFamily),w:Math.max(i.width,1),h:size,center:{x:m[4]+i.width/2,y:m[5]-size*ascent/2}};
  });
  let transform=[...identity],stroke='#617a4b',fill='#ffffff',lineWidth=1,stack=[],path=null;
  const shapes=[],wires=[];
  const tx=(x,y)=>point(multiply(viewport.transform,transform),x,y);
  function consumePath(args){
    const [ops,coords]=args;let j=0,points=[],start=null,end=null,closed=false,straightSegments=0;
    const add=(x,y,isEnd=true)=>{const p=tx(x,y);points.push(p);if(!start)start=p;if(isEnd)end=p;};
    for(const op of ops){
      if(op===OPS.rectangle){const x=coords[j++],y=coords[j++],w=coords[j++],h=coords[j++];add(x,y);add(x+w,y);add(x+w,y+h);add(x,y+h);closed=true;straightSegments+=4;}
      else if(op===OPS.moveTo||op===OPS.lineTo){add(coords[j++],coords[j++]);if(op===OPS.lineTo)straightSegments++;}
      else if(op===OPS.curveTo){add(coords[j++],coords[j++],false);add(coords[j++],coords[j++],false);add(coords[j++],coords[j++]);}
      else if(op===OPS.curveTo2){add(coords[j++],coords[j++],false);add(coords[j++],coords[j++]);}
      else if(op===OPS.curveTo3){add(coords[j++],coords[j++],false);add(coords[j++],coords[j++]);}
      else if(op===OPS.closePath)closed=true;
    }
    if(points.length){const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));path={x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y,start,end,closed:closed||(start&&end&&Math.hypot(start.x-end.x,start.y-end.y)<.1),pointCount:points.length,straightSegments};}
  }
  const fillOps=new Set([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
  const strokeOps=new Set([OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];
    if(op===OPS.save)stack.push({transform:[...transform],stroke,fill,lineWidth});
    else if(op===OPS.restore){const last=stack.pop();if(last)({transform,stroke,fill,lineWidth}=last);}
    else if(op===OPS.transform)transform=multiply(transform,args);
    else if(op===OPS.setStrokeRGBColor)stroke=colorHex(args);
    else if(op===OPS.setFillRGBColor)fill=colorHex(args,'#ffffff');
    else if(op===OPS.setStrokeGray)stroke=colorHex(Array(3).fill(args[0]*255));
    else if(op===OPS.setFillGray)fill=colorHex(Array(3).fill(args[0]*255));
    else if(op===OPS.setStrokeCMYKColor)stroke=cmykHex(args);
    else if(op===OPS.setFillCMYKColor)fill=cmykHex(args);
    else if(op===OPS.setLineWidth)lineWidth=args[0];
    else if(op===OPS.constructPath)consumePath(args);
    else if(fillOps.has(op)||strokeOps.has(op)){
      if(path){
        const inside=texts.filter(t=>contains(path,t.center,1));
        const usable=path.w>18&&path.h>7&&path.w<viewport.width*.85&&path.h<viewport.height*.85&&path.w*path.h<viewport.width*viewport.height*.4;
        if(usable&&inside.length&&(fillOps.has(op)||(path.closed&&path.straightSegments>=2)))shapes.push({...path,color:strokeOps.has(op)?stroke:fill,fill:fillOps.has(op)?fill:'#ffffff',inside});
        else if(strokeOps.has(op)&&!path.closed&&path.start&&path.end&&Math.hypot(path.start.x-path.end.x,path.start.y-path.end.y)>8)wires.push({...path,color:stroke,lineWidth});
      }
      path=null;
    }else if(op===OPS.endPath)path=null;
  }
  // Deduplicate shadow/fill/stroke boxes. Reject inner decorative badges when a larger box owns them.
  const unique=[];
  for(const s of shapes){if(!unique.some(t=>Math.abs(t.x-s.x)<1.5&&Math.abs(t.y-s.y)<1.5&&Math.abs(t.w-s.w)<2&&Math.abs(t.h-s.h)<2))unique.push(s);}
  const boxes=unique.filter(s=>!unique.some(t=>t!==s&&t.w*t.h>s.w*s.h*1.5&&contains(t,{x:s.x,y:s.y},1)&&contains(t,{x:s.x+s.w,y:s.y+s.h},1)));
  const assigned=new Set(),nodes=[];
  for(const s of boxes){
    const ts=texts.filter(t=>contains(s,t.center,1));if(!ts.length)continue;
    ts.forEach(t=>assigned.add(t));
    const max=Math.max(...ts.map(t=>t.size)),title=ts.filter(t=>Math.abs(t.size-max)<.5).map(t=>t.text).join(' ').slice(0,200);
    const dark=Number.parseInt(s.fill.slice(1,3),16)*.299+Number.parseInt(s.fill.slice(3,5),16)*.587+Number.parseInt(s.fill.slice(5,7),16)*.114<100;
    nodes.push({id:uid('n'),x:s.x,y:s.y,w:s.w,h:s.h,title,text:ts.map(t=>t.text).join('\n'),fontSize:max,color:s.color,fill:s.fill,kind:'topic',items:ts.map(t=>({text:t.text,x:t.x-s.x,y:t.y-s.y,size:t.size,bold:t.bold,color:dark?'#ffffff':'#30432e'}))});
  }
  // For unboxed digital maps, group text into nearby lines and create movable topic cards.
  if(!nodes.length&&texts.length){
    const sorted=[...texts].sort((a,b)=>a.y-b.y||a.x-b.x),groups=[];
    for(const t of sorted){
      const g=groups.find(g=>Math.abs(g.bottom-t.y)<t.size*1.9&&Math.abs(g.x-t.x)<Math.max(15,t.size*2)&&g.ts.length<24);
      if(g){g.ts.push(t);g.bottom=t.y;g.w=Math.max(g.w,t.x+t.w-g.x);}else groups.push({x:t.x,y:t.y-t.size,bottom:t.y,w:t.w,ts:[t]});
    }
    for(const g of groups){
      const pad=5,top=Math.min(...g.ts.map(t=>t.y-t.size)),h=g.bottom-top+pad*2;
      nodes.push({id:uid('n'),x:g.x-pad,y:top-pad,w:Math.max(40,g.w+pad*2),h:Math.max(16,h),title:g.ts[0].text.slice(0,200),text:g.ts.map(t=>t.text).join('\n'),fontSize:Math.max(...g.ts.map(t=>t.size)),color:'#7b9165',fill:'#ffffff',kind:'topic',items:g.ts.map(t=>({text:t.text,x:t.x-g.x+pad,y:t.y-top+pad,size:t.size,bold:t.bold,color:'#30432e'}))});
    }
  }
  const edges=[],seen=new Set(),threshold=Math.max(10,Math.min(viewport.width,viewport.height)*.025);
  for(const wire of wires){
    const a=nodes.reduce((best,n)=>!best||rectDistance(n,wire.start)<rectDistance(best,wire.start)?n:best,null);
    const b=nodes.reduce((best,n)=>!best||rectDistance(n,wire.end)<rectDistance(best,wire.end)?n:best,null);
    if(!a||!b||a===b||rectDistance(a,wire.start)>threshold||rectDistance(b,wire.end)>threshold)continue;
    const key=[a.id,b.id].sort().join('|');if(seen.has(key))continue;seen.add(key);
    edges.push({id:uid('e'),source:a.id,target:b.id,color:wire.color});
  }
  if(nodes.length>4000)throw new Error('This page contains too many text elements. Try a smaller map or a single diagram.');
  return {nodes,edges,page:{width:viewport.width,height:viewport.height},textCount:texts.length,boxed:boxes.length>0,unassigned:texts.filter(t=>!assigned.has(t)).length};
}
