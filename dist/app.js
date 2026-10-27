import * as pdfjs from './vendor/pdf.mjs';
import {createVectorPdf} from './pdf-export.js';
import {clamp,clone,uid,bounds,descendants,curve,layoutText,validateProject,extractMap} from './map-core.js';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;

const icons={
 folder:'<path d="M3 6h6l2 2h10v11H3z"/><path d="M3 6V4h6l2 2h9v2"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 15v6h16v-6"/>',
 map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 export:'<path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6"/>',cursor:'<path d="m5 3 14 10-7 1-3 7z"/>',
 connect:'<path d="m10 14 4-4M8 15l-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 1 2-2a3 3 0 0 1 4 4l-5 5a3 3 0 0 1-4 0" transform="translate(1 0)"/>',
 undo:'<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(1 -2)"/>',redo:'<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" transform="translate(-1 -2)"/>',
 fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z"/>',target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
 edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',spark:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',file:'<path d="M5 2h9l5 5v15H5zM14 2v6h5"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.map}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const make=(tag,attrs={},text)=>{const el=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;return el;};
const dom=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const canvas=$('canvas'),svg=$('map-svg'),viewport=$('viewport');
let graph={schema:'maploom/1',title:'Untitled map',nodes:[],edges:[],page:{width:1800,height:1305}};
let view={x:0,y:0,k:1},selected=null,selectedEdge=null,mode='select',connectFrom=null,moveBranch=false,undoStack=[],redoStack=[],expanded=new Set(),saveTimer,toastTimer;
let importDoc=null,importBytes=null,importName='',importGeneration=0,pdfRef=null,originalUrl=null,originalVisible=false,revision=0,saveChain=Promise.resolve();
const pointers=new Map();let drag=null,pinch=null,ignoreDoubleClickUntil=0;
const nodeElements=new Map(),edgeElements=new Map();
const escText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function snapshot(){return {graph:clone(graph),selected};}
function checkpoint(){stopBranchPhysics();undoStack.push(snapshot());if(undoStack.length>60)undoStack.shift();redoStack=[];updateHistory();}
function updateHistory(){$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;}
function history(direction){const from=direction==='undo'?undoStack:redoStack,to=direction==='undo'?redoStack:undoStack;if(!from.length)return;to.push(snapshot());const item=from.pop();graph=item.graph;selected=item.selected;selectedEdge=null;renderAll();scheduleSave();}
function changed(){revision++;scheduleSave();updateMeta();renderOutline();updateHistory();}
function selectedNode(){return graph.nodes.find(n=>n.id===selected);}
function updateMeta(){$('project-title').textContent=graph.title;$('canvas-title').textContent=graph.title;$('node-count').textContent=`${graph.nodes.length} nodes · ${graph.edges.length} connections`;$('canvas-empty').hidden=graph.nodes.length>0||!!graph.sourceData||!!graph.sourceUrl;$('source-controls').hidden=!graph.sourceUrl&&!graph.sourceData;}
function worldPoint(clientX,clientY){const r=svg.getBoundingClientRect();return {x:(clientX-r.left-view.x)/view.k,y:(clientY-r.top-view.y)/view.k};}
function viewTransform(){viewport.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.k})`);$('zoom-label').textContent=`${Math.round(view.k*100)}%`;}
function zoom(factor,cx,cy){const r=svg.getBoundingClientRect(),x=cx??r.width/2,y=cy??r.height/2,k=clamp(view.k*factor,.06,12);view.x=x-(x-view.x)*k/view.k;view.y=y-(y-view.y)*k/view.k;view.k=k;viewTransform();scheduleSave();}
function fitNodes(nodes,padding=65,maxZoom=3){if(!nodes.length)return;const b=bounds(nodes),r=svg.getBoundingClientRect();view.k=clamp(Math.min((r.width-padding*2)/Math.max(b.w,1),(r.height-padding*2)/Math.max(b.h,1)),.06,maxZoom);view.x=r.width/2-(b.x+b.w/2)*view.k;view.y=r.height/2-(b.y+b.h/2)*view.k;viewTransform();scheduleSave();}
function fitMap(){fitNodes(graph.nodes,55,3);}
function rootNode(){const targets=new Set(graph.edges.map(e=>e.target));return graph.nodes.find(n=>n.kind==='topic'&&!targets.has(n.id))||graph.nodes.find(n=>!targets.has(n.id))||graph.nodes[0];}
function focusCore(){const root=rootNode();if(!root)return;const ids=new Set([root.id,...graph.edges.filter(e=>e.source===root.id).map(e=>e.target)]);fitNodes(graph.nodes.filter(n=>ids.has(n.id)),72,2.5);}
function contrast(color){const c=color.slice(1);return parseInt(c.slice(0,2),16)*.299+parseInt(c.slice(2,4),16)*.587+parseInt(c.slice(4,6),16)*.114<120?'#f6faef':'#33482e';}
function renderNode(n){
  const g=make('g',{'class':`map-node${n.id===selected?' selected':''}`,'data-node-id':n.id,transform:`translate(${n.x} ${n.y})`,tabindex:0,role:'button','aria-label':`Topic: ${n.title}`});
  const title=make('title',{},`${n.title}\nDrag to move. Tap to edit.`);g.append(title);
  g.append(make('rect',{'class':'node-shape',width:n.w,height:n.h,rx:Math.min(n.h*.12,8),fill:n.fill||'#ffffff',stroke:n.color||'#7b9165','stroke-width':Math.min(1.3,n.w/120)}));
  const clipId=`clip-${n.id.replace(/[^\w-]/g,'')}`;
  const defs=make('defs'),clip=make('clipPath',{id:clipId});clip.append(make('rect',{width:n.w,height:n.h,rx:3}));defs.append(clip);g.append(defs);
  const content=make('g',{'class':'node-content','clip-path':`url(#${clipId})`});
  if(n.items){for(const t of n.items)content.append(make('text',{x:t.x,y:t.y,'font-family':'Arial, Helvetica, sans-serif','font-size':t.size,'font-weight':t.bold?700:400,fill:t.color||contrast(n.fill)},t.text));}
  else{const l=layoutText(n);for(let i=0;i<l.lines.length;i++)content.append(make('text',{x:l.pad,y:l.pad+l.size+i*l.lineHeight,'font-family':'Arial, Helvetica, sans-serif','font-size':l.size,fill:contrast(n.fill||'#ffffff')},l.lines[i]));}
  g.append(content);g.append(make('rect',{'class':'selection-outline',x:-5,y:-5,width:n.w+10,height:n.h+10,rx:7}));
  const old=nodeElements.get(n.id);if(old)old.replaceWith(g);else $('nodes').append(g);nodeElements.set(n.id,g);return g;
}
function renderEdges(){
  $('edges').replaceChildren();edgeElements.clear();const lookup=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const e of graph.edges){const a=lookup.get(e.source),b=lookup.get(e.target);if(!a||!b)continue;const g=make('g',{'class':`map-edge${e.id===selectedEdge?' selected':''}`,'data-edge-id':e.id});const path=curve(a,b).path;g.append(make('path',{d:path,'class':'edge-line',stroke:e.color||a.color}));g.append(make('path',{d:path,'class':'edge-hit'}));g.append(make('title',{},`${a.title} → ${b.title}. Select and press Delete to disconnect.`));$('edges').append(g);edgeElements.set(e.id,g);}
}
function renderAll(){stopBranchPhysics();nodeElements.clear();$('nodes').replaceChildren();graph.nodes.forEach(renderNode);renderEdges();updateMeta();renderOutline();renderInspector();viewTransform();updateHistory();$('show-original').checked=originalVisible;$('original-image').setAttribute('opacity',originalVisible?.25:0);}
function selectNode(id,{focus=false}={}){const previous=selected;selected=id;selectedEdge=null;edgeElements.forEach(el=>el.classList.remove('selected'));if(nodeElements.get(previous))nodeElements.get(previous).classList.remove('selected');if(nodeElements.get(id)){nodeElements.get(id).classList.add('selected');$('nodes').append(nodeElements.get(id));}renderInspector();renderOutline();if(focus){const n=selectedNode();if(n)fitNodes([n],100,4);} }
function clearSelection(){selectNode(null);$('inspector').classList.remove('visible');}
function getRootBranches(){const root=rootNode();if(!root)return [];let ids=graph.edges.filter(e=>e.source===root.id).map(e=>e.target);if(!ids.length)return graph.nodes.slice(0,100);return graph.nodes.filter(n=>ids.includes(n.id));}
function renderOutline(){
  const panel=$('outline');panel.replaceChildren();const q=$('search').value.trim().toLowerCase();
  let entries=q?graph.nodes.filter(n=>(n.title+' '+n.text).toLowerCase().includes(q)).slice(0,150):getRootBranches();
  if(!entries.length){panel.append(dom('p','outline-empty',q?'No matching topics.':'Add a topic to get started.'));return;}
  const row=(n,sub=false)=>{const r=dom('button',`outline-row${sub?' sub-row':''}${n.id===selected?' selected':''}`);r.type='button';const dot=dom('span','dot');dot.style.background=n.color;r.append(dot,dom('span','outline-name',n.title));const count=descendants(graph,n.id).size-1;if(count&&!sub)r.append(dom('span','outline-count',String(count)),dom('span','chevron',expanded.has(n.id)?'⌄':'›'));r.title=n.title;r.addEventListener('click',()=>{selectNode(n.id);if(q)fitNodes([n],100,4);else{const ids=descendants(graph,n.id);fitNodes(graph.nodes.filter(x=>ids.has(x.id)),60,3);expanded.has(n.id)?expanded.delete(n.id):expanded.add(n.id);renderOutline();}$('sidebar').classList.remove('visible');});return r;};
  for(const n of entries){panel.append(row(n));if(!q&&expanded.has(n.id)){const ids=graph.edges.filter(e=>e.source===n.id).map(e=>e.target);for(const child of graph.nodes.filter(c=>ids.includes(c.id)))panel.append(row(child,true));}}
}
function renderInspector(){
  const n=selectedNode();$('inspector-empty').hidden=!!n;$('node-properties').hidden=!n;$('inspector-title').textContent=n?'Topic details':'The details';
  if(!n)return;
  $('inspector').classList.add('visible');$('node-title').value=n.title;$('node-text').value=n.text;$('node-color').value=n.color;$('node-fill').value=n.fill;$('node-width').value=Math.round(n.w);$('node-font').value=Number(n.fontSize.toFixed(1));$('node-color-label').textContent=n.color;$('node-fill-label').textContent=n.fill;
  const edges=graph.edges.filter(e=>e.source===n.id||e.target===n.id);$('connection-count').textContent=edges.length;$('connection-list').replaceChildren();
  for(const e of edges){const other=graph.nodes.find(x=>x.id===(e.source===n.id?e.target:e.source));if(!other)continue;const row=dom('div','connection-row'),name=dom('button','connection-name',`${e.source===n.id?'↗':'↙'} ${other.title}`);name.title=other.title;name.onclick=()=>selectNode(other.id,{focus:true});const remove=dom('button','icon-button');remove.innerHTML=icon('close');remove.title='Remove connection';remove.setAttribute('aria-label',`Disconnect ${other.title}`);remove.onclick=()=>{checkpoint();graph.edges=graph.edges.filter(x=>x.id!==e.id);renderEdges();renderInspector();changed();};row.append(name,remove);$('connection-list').append(row);}
}
function updateSelected(mutator,{reflow=false}={}){const n=selectedNode();if(!n)return;checkpoint();mutator(n);if(reflow){delete n.items;n.h=Math.max(30,layoutText(n).height);}renderNode(n);renderEdges();renderInspector();changed();}
function addNode(parentId=null,position=null){checkpoint();const p=graph.nodes.find(n=>n.id===parentId),r=svg.getBoundingClientRect(),at=position||worldPoint(r.left+r.width/2,r.top+r.height/2);const n={id:uid('n'),x:p?p.x+p.w+80:at.x-105,y:p?p.y:at.y-35,w:p?Math.max(150,p.w):210,h:70,title:'A new idea',text:'A new idea',color:p?.color||'#79945b',fill:'#ffffff',fontSize:p?clamp(p.fontSize,10,16):14,kind:'topic'};graph.nodes.push(n);if(p)graph.edges.push({id:uid('e'),source:p.id,target:n.id,color:p.color});renderNode(n);renderEdges();selectNode(n.id);changed();if(p)fitNodes([p,n],80,3);else fitNodes([n],100,2);quickEdit();}
function removeSelected(){if(selected){checkpoint();const id=selected;graph.nodes=graph.nodes.filter(n=>n.id!==id);graph.edges=graph.edges.filter(e=>e.source!==id&&e.target!==id);selected=null;renderAll();changed();toast('Topic deleted. Undo restores it.');}else if(selectedEdge){checkpoint();graph.edges=graph.edges.filter(e=>e.id!==selectedEdge);selectedEdge=null;renderEdges();changed();toast('Connection removed.');}}
function duplicateSelected(){const n=selectedNode();if(!n)return;checkpoint();const copy={...clone(n),id:uid('n'),x:n.x+30,y:n.y+n.h+25,title:n.title+' (copy)'};graph.nodes.push(copy);renderNode(copy);selectNode(copy.id);changed();}
function setMode(next){mode=next;connectFrom=null;$('tool-select').classList.toggle('active',mode==='select');$('tool-connect').classList.toggle('active',mode==='connect');canvas.classList.toggle('connect-mode',mode==='connect');$('mode-hint').hidden=mode!=='connect';$('mode-hint').textContent='Choose a starting node, then a destination.';}
function connectNode(id){if(!connectFrom){connectFrom=id;selectNode(id);$('mode-hint').textContent='Now choose the topic to connect to.';return;}if(connectFrom===id){toast('Choose a different topic.');return;}if(graph.edges.some(e=>(e.source===connectFrom&&e.target===id)||(e.target===connectFrom&&e.source===id))){toast('These topics are already connected.');return;}checkpoint();graph.edges.push({id:uid('e'),source:connectFrom,target:id,color:graph.nodes.find(n=>n.id===id)?.color||'#809b5c'});renderEdges();selectNode(id);changed();setMode('select');toast('Ideas connected.');}
function quickEdit(){const n=selectedNode();if(!n)return;$('quick-title').value=n.title;$('quick-text').value=n.text;openModal('edit-modal');setTimeout(()=>$('quick-text').focus(),30);}
function renameText(n,nextTitle){const old=n.title;if(old!==nextTitle){const index=n.text.indexOf(old);n.text=index>=0?n.text.slice(0,index)+nextTitle+n.text.slice(index+old.length):nextTitle+'\n'+n.text;}n.title=nextTitle;}
function applyQuickEdit(){updateSelected(n=>{const nextTitle=$('quick-title').value.trim()||'Untitled topic',nextText=$('quick-text').value;if(nextText===n.text)renameText(n,nextTitle);else{n.title=nextTitle;n.text=nextText||nextTitle;}},{reflow:true});closeModal('edit-modal');}
let priorFocus=null;
function openModal(id){priorFocus=document.activeElement;$(id).hidden=false;($(id).querySelector('textarea')||$(id).querySelector('button'))?.focus();}
function closeModal(id){$(id).hidden=true;priorFocus?.focus?.();}
function showImport(){openModal('import-modal');}

// Browser-local durable working copy. Exported projects are the portable source of truth.
let database=null;
function db(){if(database)return Promise.resolve(database);return new Promise((resolve,reject)=>{const request=indexedDB.open('maploom-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>{database=request.result;resolve(database);};request.onerror=()=>reject(request.error);});}
async function writeLocal(value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function readLocal(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('projects');const request=tx.objectStore('projects').get('current');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function localState(){return {graph:clone(graph),view:clone(view),preferences:{moveBranch},updated:Date.now()};}
function scheduleSave(){clearTimeout(saveTimer);$('save-status').textContent='Saving…';saveTimer=setTimeout(()=>{const value=localState();saveChain=saveChain.catch(()=>{}).then(()=>writeLocal(value));saveChain.then(()=>$('save-status').textContent='Saved on this device').catch(()=>$('save-status').textContent='Save a project to keep your edits');},650);}
function updateBranchToggle(){const toggle=$('move-branch-toggle');toggle.setAttribute('aria-checked',String(moveBranch));$('branch-toggle-state').textContent=moveBranch?'On':'Off';toggle.title=moveBranch?'On: outer branches follow with a soft spring and a slight delay.':'Off: only the topic you drag moves.';}
let lastDownloadUrl=null;
function download(blob,name){if(lastDownloadUrl)URL.revokeObjectURL(lastDownloadUrl);lastDownloadUrl=URL.createObjectURL(blob);const a=$('download-link');a.href=lastDownloadUrl;a.download=name;$('download-filename').textContent=name;$('download-ready').hidden=false;a.click();}
$('close-download').onclick=()=>$('download-ready').hidden=true;
const safeName=()=>graph.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'my-map';
function exportProject(){download(new Blob([JSON.stringify(graph,null,2)],{type:'application/json'}),`${safeName()}.maploom`);toast('Editable project downloaded. Open it in Maploom to continue later.');}
async function loadProject(file){if(!file)return;if(file.size>40*1024*1024){toast('Choose a project smaller than 40 MB.');return;}try{const next=validateProject(JSON.parse(await file.text()));checkpoint();graph=next;selected=null;selectedEdge=null;expanded.clear();originalVisible=!graph.nodes.length;await refreshReference();renderAll();fitMap();changed();toast('Project opened. Everything is editable.');}catch(e){toast(e.message||'Could not open this project.');}}
async function loadExample({remember=true}={}){try{const response=await fetch('./assets/sample.json');if(!response.ok)throw new Error('Could not load the example.');const data=validateProject(await response.json());if(remember)checkpoint();graph=data;selected=null;selectedEdge=null;expanded.clear();originalVisible=false;await refreshReference();renderAll();focusCore();if(remember)changed();}catch(e){toast(e.message);}}
function blankCanvas(){checkpoint();graph={schema:'maploom/1',title:'Untitled map',nodes:[],edges:[],page:{width:1800,height:1305}};selected=null;selectedEdge=null;originalVisible=false;refreshReference();renderAll();changed();$('sidebar').classList.remove('visible');toast('Blank canvas ready. Add a topic or import a PDF.');}
async function refreshReference(){
  pdfRef?.destroy?.();pdfRef=null;
  if(originalUrl){URL.revokeObjectURL(originalUrl);originalUrl=null;}$('original-image').removeAttribute('href');
  if(!graph.sourceData&&!graph.sourceUrl)return;
  if(originalVisible)await renderOriginal();
}
function base64FromBytes(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
function bytesFromBase64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function renderOriginal(){
  if(originalUrl){$('original-image').setAttribute('opacity',originalVisible?.25:0);return;}
  if(!graph.sourceData&&!graph.sourceUrl)return;
  try{
    if(!pdfRef)pdfRef=await pdfjs.getDocument(graph.sourceData?{data:bytesFromBase64(graph.sourceData)}:graph.sourceUrl).promise;
    const page=await pdfRef.getPage(graph.sourcePage||1),base=page.getViewport({scale:1});
    const scale=Math.min(2,2400/base.width,2400/base.height),v=page.getViewport({scale});const c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await page.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)return;originalUrl=URL.createObjectURL(blob);const image=$('original-image');image.setAttribute('href',originalUrl);image.setAttribute('width',base.width);image.setAttribute('height',base.height);image.setAttribute('opacity',originalVisible?.25:0);
  }catch(e){toast('The original PDF reference could not be rendered. Your editable topics are still available.');}
}
async function choosePdf(file){
  if(!file)return;const generation=++importGeneration;
  if(file.size>25*1024*1024){showImportError('Choose a PDF smaller than 25 MB.');return;}
  $('convert-pdf').disabled=true;$('import-progress').hidden=false;$('import-progress').classList.remove('error');$('import-progress').textContent='Reading your PDF…';
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.subarray(0,1024)).indexOf('%PDF-')<0)throw new Error('This file does not appear to be a PDF.');
    const task=pdfjs.getDocument({data:bytes.slice()});task.onPassword=()=>{task.destroy();showImportError('This PDF is password-protected. Upload an unlocked copy.');};
    const doc=await task.promise;if(generation!==importGeneration){doc.destroy();return;}
    importDoc?.destroy?.();importDoc=doc;importBytes=bytes;importName=file.name;
    $('import-filename').textContent=file.name;$('import-fileinfo').textContent=`${doc.numPages} page${doc.numPages>1?'s':''} · ${(file.size/1024/1024).toFixed(2)} MB`;
    $('pdf-page').replaceChildren();for(let i=1;i<=doc.numPages;i++){const option=dom('option','',String(i));option.value=i;$('pdf-page').append(option);}
    $('dropzone').hidden=true;$('import-options').hidden=false;$('import-progress').hidden=true;$('convert-pdf').disabled=false;
  }catch(e){if(generation===importGeneration)showImportError(e.name==='PasswordException'?'This PDF is password-protected. Upload an unlocked copy.':e.message||'We could not read this PDF.');}
}
function showImportError(message){$('import-progress').textContent=message;$('import-progress').hidden=false;$('import-progress').classList.add('error');$('convert-pdf').disabled=true;}
function clearImport(){++importGeneration;importDoc?.destroy?.();importDoc=null;importBytes=null;importName='';$('pdf-input').value='';$('dropzone').hidden=false;$('import-options').hidden=true;$('import-progress').hidden=true;$('convert-pdf').disabled=true;}
async function convertPdf(){
  if(!importDoc)return;const button=$('convert-pdf');button.disabled=true;$('import-progress').hidden=false;$('import-progress').classList.remove('error');$('import-progress').textContent='Finding text, topics, and connections…';
  try{
    const sourcePage=Number($('pdf-page').value),page=await importDoc.getPage(sourcePage),result=await extractMap(page,pdfjs);
    checkpoint();graph={schema:'maploom/1',title:importName.replace(/\.pdf$/i,''),nodes:result.nodes,edges:result.edges,page:result.page,sourcePage,sourceData:base64FromBytes(importBytes)};
    selected=null;selectedEdge=null;expanded.clear();originalVisible=!result.nodes.length;
    await refreshReference();renderAll();if(graph.nodes.length)fitMap();else{const r=svg.getBoundingClientRect();view.k=Math.min((r.width-100)/result.page.width,(r.height-100)/result.page.height);view.x=(r.width-result.page.width*view.k)/2;view.y=(r.height-result.page.height*view.k)/2;viewTransform();$('canvas-empty').hidden=true;$('canvas-tip').textContent='Scanned PDF reference · Add topics to build your editable map';}
    changed();closeModal('import-modal');$('sidebar').classList.remove('visible');
    if(!result.nodes.length)toast('No selectable text found. The PDF is a reference image; add topics on top to build your map.');
    else toast(`${result.nodes.length} editable topics and ${result.edges.length} connections found. Review the imported layout and links.`);
  }catch(e){showImportError(e.message||'Conversion failed. Try a smaller or unlocked PDF.');}
  finally{button.disabled=!importDoc;}
}

let exportFonts=null;
async function exportPdf(){
  if(!graph.nodes.length){toast('Add some topics before exporting an editable map.');return;}
  const button=$('export-pdf');button.disabled=true;toast('Creating your vector PDF…');
  try{
    if(!exportFonts)exportFonts=await Promise.all(['./assets/DejaVuSans.ttf','./assets/DejaVuSans-Bold.ttf'].map(async url=>{const response=await fetch(url);if(!response.ok)throw new Error('The export fonts could not be loaded. Please retry.');return new Uint8Array(await response.arrayBuffer());}));
    const result=await createVectorPdf(graph,{PDFLib:window.PDFLib,fontkit:window.fontkit,fontBytes:exportFonts[0],boldFontBytes:exportFonts[1]});
    download(new Blob([result.bytes],{type:'application/pdf'}),`${safeName()}-edited.pdf`);
    toast(result.substitutions?'PDF exported. Some unsupported font characters became “?”. The project file keeps the original text.':'Vector PDF exported. Text and lines stay sharp when you zoom.');
  }catch(e){toast(`Could not export PDF: ${e.message}`);}finally{button.disabled=false;}
}

// Descendants follow a damped spring; deeper branches feel a little softer.
let branchFrame=0,branchLastTime=0;
const branchSprings=new Map();
function stopBranchPhysics(){
  cancelAnimationFrame(branchFrame);branchFrame=0;branchLastTime=0;
  for(const spring of branchSprings.values()){
    if(graph.nodes.includes(spring.node)){spring.node.x=spring.x;spring.node.y=spring.y;nodeElements.get(spring.node.id)?.setAttribute('transform',`translate(${spring.x} ${spring.y})`);}
  }
  if(branchSprings.size)renderEdges();branchSprings.clear();
}
function animateBranches(time){
  const dt=Math.min((time-(branchLastTime||time-16.67))/1000,.032);branchLastTime=time;let active=false;
  for(const [id,s] of branchSprings){
    if(!graph.nodes.includes(s.node)){branchSprings.delete(id);continue;}
    const stiffness=130/(1+s.depth*.3),damping=2*Math.sqrt(stiffness)*.73;
    s.vx+=((s.x-s.node.x)*stiffness-s.vx*damping)*dt;s.vy+=((s.y-s.node.y)*stiffness-s.vy*damping)*dt;
    s.node.x+=s.vx*dt;s.node.y+=s.vy*dt;
    if(Math.hypot(s.x-s.node.x,s.y-s.node.y)<.04&&Math.hypot(s.vx,s.vy)<.08){s.node.x=s.x;s.node.y=s.y;s.vx=s.vy=0;}else active=true;
    nodeElements.get(id)?.setAttribute('transform',`translate(${s.node.x} ${s.node.y})`);
  }
  renderEdges();
  if(active)branchFrame=requestAnimationFrame(animateBranches);
  else{branchFrame=0;branchLastTime=0;if(!drag?.moved)scheduleSave();}
}
function followBranch(node,x,y,depth){
  let spring=branchSprings.get(node.id);
  if(!spring){spring={node,x,y,vx:0,vy:0,depth};branchSprings.set(node.id,spring);}else{spring.x=x;spring.y=y;}
  if(!branchFrame){branchLastTime=0;branchFrame=requestAnimationFrame(animateBranches);}
}
function branchDepths(id){const depths=new Map([[id,0]]),queue=[id];while(queue.length){const parent=queue.shift();for(const edge of graph.edges)if(edge.source===parent&&!depths.has(edge.target)){depths.set(edge.target,depths.get(parent)+1);queue.push(edge.target);}}return depths;}
// Mouse, touch, and pen share the same movement model.
svg.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;stopBranchPhysics();canvas.focus();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});svg.setPointerCapture(e.pointerId);
  if(pointers.size===2){if(drag?.type==='node'&&drag.moved)changed();drag=null;svg.classList.remove('grabbing');const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},view:clone(view)};ignoreDoubleClickUntil=Date.now()+500;return;}
  const nodeTarget=e.target.closest('[data-node-id]'),edgeTarget=e.target.closest('[data-edge-id]');
  if(nodeTarget){const id=nodeTarget.dataset.nodeId;if(mode==='connect'){connectNode(id);return;}const ids=moveBranch?descendants(graph,id):new Set([id]);drag={depths:branchDepths(id),springy:moveBranch&&!matchMedia('(prefers-reduced-motion: reduce)').matches,type:'node',start:worldPoint(e.clientX,e.clientY),positions:graph.nodes.filter(n=>ids.has(n.id)).map(n=>({id:n.id,x:n.x,y:n.y})),moved:false,startClient:{x:e.clientX,y:e.clientY},threshold:e.pointerType==='touch'?8:5,id};}
  else if(edgeTarget){selectedEdge=edgeTarget.dataset.edgeId;selected=null;nodeElements.forEach(el=>el.classList.remove('selected'));renderEdges();renderInspector();drag=null;}
  else{drag={type:'pan',startClient:{x:e.clientX,y:e.clientY},view:clone(view),moved:false};}
});
svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],r=svg.getBoundingClientRect(),center={x:(a.x+b.x)/2-r.left,y:(a.y+b.y)/2-r.top},distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),k=clamp(pinch.view.k*distance/Math.max(1,pinch.distance),.06,12);view.k=k;view.x=center.x-((pinch.center.x-r.left-pinch.view.x)/pinch.view.k)*k;view.y=center.y-((pinch.center.y-r.top-pinch.view.y)/pinch.view.k)*k;viewTransform();return;}
  if(!drag)return;const d=Math.hypot(e.clientX-drag.startClient.x,e.clientY-drag.startClient.y);if(d<(drag.threshold||5)&&!drag.moved)return;
  if(!drag.moved&&drag.type==='node'){checkpoint();clearSelection();}drag.moved=true;svg.classList.add('grabbing');
  if(drag.type==='pan'){view.x=drag.view.x+e.clientX-drag.startClient.x;view.y=drag.view.y+e.clientY-drag.startClient.y;viewTransform();}
  else{const at=worldPoint(e.clientX,e.clientY),dx=at.x-drag.start.x,dy=at.y-drag.start.y;for(const original of drag.positions){const n=graph.nodes.find(n=>n.id===original.id);const x=original.x+dx,y=original.y+dy;if(drag.springy&&n.id!==drag.id)followBranch(n,x,y,drag.depths.get(n.id)||1);else{n.x=x;n.y=y;nodeElements.get(n.id)?.setAttribute('transform',`translate(${n.x} ${n.y})`);}}renderEdges();}
});
function endPointer(e){
  pointers.delete(e.pointerId);if(pinch){if(pointers.size<2){pinch=null;drag=null;scheduleSave();}return;}
  if(drag){if(drag.moved){changed();ignoreDoubleClickUntil=Date.now()+500;}else if(e.type!=='pointercancel'){if(drag.type==='pan')clearSelection();else if(drag.type==='node')selectNode(drag.id);}drag=null;}svg.classList.remove('grabbing');
}
svg.addEventListener('pointerup',endPointer);svg.addEventListener('pointercancel',endPointer);
svg.addEventListener('dblclick',e=>{if(Date.now()>=ignoreDoubleClickUntil&&$('edit-modal').hidden&&!e.target.closest('[data-node-id]')&&!e.target.closest('[data-edge-id]')&&!selected){const at=worldPoint(e.clientX,e.clientY);addNode(null,at);}});
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();if(e.ctrlKey||e.metaKey||Math.abs(e.deltaY)>40){zoom(Math.exp(-e.deltaY*.003),e.clientX-r.left,e.clientY-r.top);}else{view.x-=e.deltaX;view.y-=e.deltaY;viewTransform();scheduleSave();}},{passive:false});
svg.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.dataset.nodeId){e.preventDefault();selectNode(e.target.dataset.nodeId);quickEdit();}});

// Editing controls commit on change so each user action gets its own undo step.
$('node-title').addEventListener('change',()=>updateSelected(n=>renameText(n,$('node-title').value.trim()||'Untitled topic'),{reflow:true}));
$('node-text').addEventListener('change',()=>updateSelected(n=>n.text=$('node-text').value||n.title,{reflow:true}));
$('node-color').addEventListener('change',()=>updateSelected(n=>{n.color=$('node-color').value;for(const e of graph.edges)if(e.source===n.id)e.color=n.color;}));
$('node-fill').addEventListener('change',()=>updateSelected(n=>{n.fill=$('node-fill').value;if(n.items)for(const item of n.items)item.color=contrast(n.fill);}));
$('node-width').addEventListener('change',()=>updateSelected(n=>n.w=clamp(Number($('node-width').value)||n.w,30,2000),{reflow:true}));
$('node-font').addEventListener('change',()=>updateSelected(n=>n.fontSize=clamp(Number($('node-font').value)||12,3,100),{reflow:true}));
$('move-branch-toggle').addEventListener('click',()=>{stopBranchPhysics();moveBranch=!moveBranch;updateBranchToggle();scheduleSave();});
$('show-original').addEventListener('change',async()=>{originalVisible=$('show-original').checked;if(originalVisible)await renderOriginal();$('original-image').setAttribute('opacity',originalVisible?.25:0);});
$('open-import').onclick=showImport;$('empty-import').onclick=showImport;$('close-import').onclick=()=>closeModal('import-modal');$('clear-file').onclick=clearImport;$('pdf-input').onchange=e=>choosePdf(e.target.files[0]);$('convert-pdf').onclick=convertPdf;
for(const id of ['use-example','load-example'])$(id).onclick=()=>{closeModal('import-modal');loadExample();};
for(const id of ['add-node','add-top-node','empty-node'])$(id).onclick=()=>addNode();
$('start-blank').onclick=blankCanvas;$('add-child').onclick=()=>addNode(selected);$('duplicate-node').onclick=duplicateSelected;$('delete-node').onclick=removeSelected;$('deselect').onclick=clearSelection;
$('tool-select').onclick=()=>setMode('select');$('tool-connect').onclick=()=>setMode(mode==='connect'?'select':'connect');$('undo').onclick=()=>history('undo');$('redo').onclick=()=>history('redo');
$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);$('zoom-label').onclick=()=>zoom(1/view.k);$('fit-map').onclick=fitMap;$('focus-core').onclick=focusCore;
$('save-project').onclick=exportProject;$('open-project').onclick=()=>$('project-input').click();$('project-input').onchange=e=>{loadProject(e.target.files[0]);e.target.value='';};$('export-pdf').onclick=exportPdf;
$('search').oninput=renderOutline;$('toggle-sidebar').onclick=()=>$('sidebar').classList.toggle('visible');$('close-sidebar').onclick=()=>$('sidebar').classList.remove('visible');
$('apply-edit').onclick=applyQuickEdit;for(const id of ['close-edit','cancel-edit'])$(id).onclick=()=>closeModal('edit-modal');
for(const id of ['import-modal','edit-modal'])$(id).addEventListener('pointerdown',e=>{if(e.target===$(id))closeModal(id);});
const dropzone=$('dropzone');for(const name of ['dragenter','dragover'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.add('dragover');});for(const name of ['dragleave','drop'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.remove('dragover');if(name==='drop')choosePdf(e.dataTransfer.files[0]);});
canvas.addEventListener('dragover',e=>e.preventDefault());canvas.addEventListener('drop',e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(!file)return;if(/\.pdf$/i.test(file.name)){showImport();choosePdf(file);}else loadProject(file);});
document.addEventListener('keydown',e=>{
  const modal=document.querySelector('.modal-backdrop:not([hidden])');
  if(e.key==='Escape'){if(modal)closeModal(modal.id);else if(mode==='connect')setMode('select');else clearSelection();return;}
  if(modal){if(e.key==='Tab'){const items=[...modal.querySelectorAll('button:not([disabled]),input:not([hidden]),textarea,select')].filter(el=>el.offsetParent!==null);if(items.length){const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}return;}
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
  const cmd=e.metaKey||e.ctrlKey;if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');return;}if(cmd&&e.key.toLowerCase()==='s'){e.preventDefault();exportProject();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}else if(e.key.toLowerCase()==='v')setMode('select');else if(e.key.toLowerCase()==='c'&&!cmd)setMode('connect');else if(e.key.toLowerCase()==='n'&&!cmd)addNode();else if(e.key.toLowerCase()==='f'&&!cmd)fitMap();else if(e.key==='/'){e.preventDefault();$('sidebar').classList.add('visible');$('search').focus();}else if(e.key==='Enter'&&selected)quickEdit();
});
new ResizeObserver(()=>viewTransform()).observe(canvas);
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);stopBranchPhysics();writeLocal(localState()).catch(()=>{});});
async function init(){try{const current=await readLocal();if(current?.graph){graph=validateProject(current.graph);moveBranch=!!current.preferences?.moveBranch;originalVisible=!graph.nodes.length;if(current.view&&['x','y','k'].every(k=>Number.isFinite(current.view[k])))view={...current.view,k:clamp(current.view.k,.06,12)};await refreshReference();renderAll();viewTransform();}else await loadExample({remember:false});}catch{await loadExample({remember:false});}$('save-status').textContent='Saved on this device';updateBranchToggle();updateHistory();}
init();
