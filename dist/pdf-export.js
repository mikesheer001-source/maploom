import {bounds,curve,layoutText} from './map-core.js';

export async function createVectorPdf(graph,{PDFLib,fontkit,fontBytes,boldFontBytes}){
  const {PDFDocument,StandardFonts,rgb}=PDFLib,doc=await PDFDocument.create();
  let regular,bold;
  if(fontkit&&fontBytes&&boldFontBytes){doc.registerFontkit(fontkit);regular=await doc.embedFont(fontBytes,{subset:true});bold=await doc.embedFont(boldFontBytes,{subset:true});}
  else{regular=await doc.embedFont(StandardFonts.Helvetica);bold=await doc.embedFont(StandardFonts.HelveticaBold);}
  const b=bounds(graph.nodes),pad=35,scale=Math.min(1,14000/(b.w+pad*2),14000/(b.h+pad*2)),width=(b.w+pad*2)*scale,height=(b.h+pad*2)*scale,page=doc.addPage([width,height]);
  const pos=(x,y)=>({x:(x-b.x+pad)*scale,y:height-(y-b.y+pad)*scale});
  const color=hex=>{const v=(hex||'#607b4b').slice(1);return rgb(parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255);};
  const ink=hex=>{const c=hex.slice(1);return parseInt(c.slice(0,2),16)*.299+parseInt(c.slice(2,4),16)*.587+parseInt(c.slice(4,6),16)*.114<120?'#f6faef':'#33482e';};
  page.drawRectangle({x:0,y:0,width,height,color:rgb(.974,.98,.958)});
  const lookup=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const e of graph.edges){
    const a=lookup.get(e.source),bnode=lookup.get(e.target);if(!a||!bnode)continue;
    const c=curve(a,bnode),s=pos(c.start.x,c.start.y),p1=pos(c.c1.x,c.c1.y),p2=pos(c.c2.x,c.c2.y),end=pos(c.end.x,c.end.y);
    page.pushOperators(PDFLib.pushGraphicsState(),PDFLib.setStrokingColor(color(e.color)),PDFLib.setLineWidth(1.15*scale),PDFLib.moveTo(s.x,s.y),PDFLib.appendBezierCurve(p1.x,p1.y,p2.x,p2.y,end.x,end.y),PDFLib.stroke(),PDFLib.popGraphicsState());
  }
  let substitutions=0;
  const supported=fontkit&&fontBytes?new Set(regular.getCharacterSet()):null;
  const clean=(s,font)=>{let out='';for(const ch of s){if(supported&&!supported.has(ch.codePointAt(0))){out+='?';substitutions++;continue;}try{font.encodeText(ch);out+=ch;}catch{out+='?';substitutions++;}}return out;};
  for(const n of graph.nodes){
    const p=pos(n.x,n.y+n.h);page.drawRectangle({x:p.x,y:p.y,width:n.w*scale,height:n.h*scale,color:color(n.fill),borderColor:color(n.color),borderWidth:.7*scale});
    if(n.items){
      for(const t of n.items){const at=pos(n.x+t.x,n.y+t.y);page.drawText(clean(t.text,t.bold?bold:regular),{x:at.x,y:at.y,size:Math.max(.1,t.size*scale),font:t.bold?bold:regular,color:color(t.color||ink(n.fill))});}
    }else{
      const size=n.fontSize||12,l=layoutText(n,s=>regular.widthOfTextAtSize(clean(s,regular),size));
      for(let i=0;i<l.lines.length;i++){const at=pos(n.x+l.pad,n.y+l.pad+l.size+i*l.lineHeight);page.drawText(clean(l.lines[i],regular),{x:at.x,y:at.y,size:l.size*scale,font:regular,color:color(ink(n.fill))});}
    }
  }
  doc.setTitle(graph.title);doc.setCreator('Maploom PDF Map Studio');
  return {bytes:await doc.save(),substitutions};
}
