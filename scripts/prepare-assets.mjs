import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/vendor',{recursive:true});await mkdir('dist/assets',{recursive:true});
for(const [from,to] of [
['pdfjs-dist/build/pdf.mjs','vendor/pdf.mjs'],['pdfjs-dist/build/pdf.worker.mjs','vendor/pdf.worker.mjs'],['pdf-lib/dist/pdf-lib.min.js','vendor/pdf-lib.min.js'],['@pdf-lib/fontkit/dist/fontkit.umd.min.js','vendor/fontkit.umd.min.js'],['dejavu-fonts-ttf/ttf/DejaVuSans.ttf','assets/DejaVuSans.ttf'],['dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf','assets/DejaVuSans-Bold.ttf'],['pdfjs-dist/LICENSE','vendor/pdfjs-dist-LICENSE.txt'],['pdf-lib/LICENSE.md','vendor/pdf-lib-LICENSE.txt']])await copyFile('node_modules/'+from,'dist/'+to);
