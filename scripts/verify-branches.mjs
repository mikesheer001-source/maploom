import assert from 'node:assert/strict';
import {branchPositions,dropTarget,reparent,descendants,clone} from '../dist/map-core.js';
const n=(id,x,y)=>({id,x,y,w:40,h:20,color:'#668844'});
const root=n('root',0,0),a=n('a',100,0),b=n('b',200,0),c=n('c',200,50),other=n('other',0,150);
const graph={nodes:[root,a,b,c,other],edges:[{source:'root',target:'a'},{source:'a',target:'b'},{source:'b',target:'c'},{source:'root',target:'other'}]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
const rotated=branchPositions([a,b,c],'a',0,100,root);
near(rotated[1].x,0);near(rotated[1].y,200);near(rotated[2].x,-50);near(rotated[2].y,200);
const left=branchPositions([a,b],'a',-100,0,root);near(left[1].x,-200);near(left[1].y,0);
const translated=branchPositions([root,a],'root',10,30);near(translated[1].x,110);near(translated[1].y,30);
assert.equal(dropTarget(graph,'a',{x:210,y:10}),null); // descendant cannot adopt ancestor
assert.equal(dropTarget(graph,'a',{x:10,y:160}).id,'other');
const before=clone(graph);assert.equal(reparent(graph,'a','c'),false);assert.deepEqual(graph,before);
assert.equal(reparent(graph,'a','other'),true);assert.deepEqual(graph.edges.filter(e=>e.target==='a').map(e=>e.source),['other']);
assert.ok(descendants(graph,'other').has('c'));assert.equal(graph.edges.length,4);
assert.equal(reparent(graph,'root','c'),false);
assert.ok(branchPositions([a,b],'a',root.x,root.y,root).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
console.log('Passed: outward quarter/half turns, nested branch geometry, root translation, drop target exclusion, cycle prevention, tether replacement and subtree retention.');
