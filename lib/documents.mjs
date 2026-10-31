import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const run=promisify(execFile);
export const documentLimit=10*1024*1024;
export const textLimit=24000;
export const documentSchema={type:'object',additionalProperties:false,required:['answer'],properties:{answer:{type:'string'}}};
export function decodeDocument(bytes) {
  let text;
  try {text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch {throw Error('This file is not UTF-8 text. Use PDF, DOCX, XLSX or a text export. Images, audio and video require a compatible model.');}
  if(/[\x00-\x08\x0e-\x1f]/.test(text))throw Error('Binary files are unsupported by the current text model.');
  if(!text.trim())throw Error('The file has no readable text.');
  if(text.length>textLimit)throw Error('Text limit is 24,000 characters. Split the document before uploading.');
  return text;
}
export async function extractDocument(file,name) {
  const ext=path.extname(name).toLowerCase();
  if(!['.pdf','.docx','.xlsx'].includes(ext))return decodeDocument(await readFile(file));
  try {
    const {stdout}=await run('python3',[new URL('../scripts/extract-document.py',import.meta.url).pathname,file,ext],{timeout:20000,maxBuffer:1024*1024});
    return decodeDocument(Buffer.from(JSON.parse(stdout).text));
  } catch(error) {
    let message='Document extraction failed or timed out. Try a text export.';
    try {message=JSON.parse(error.stdout).error||message;}catch{}
    throw Error(message);
  }
}
export function documentChunks(text) {
  // Bound UTF-8 bytes as well as character count to fit the local context window.
  const chunks=[];let part='',bytes=0;
  for(const character of text){const size=Buffer.byteLength(character);if(bytes+size>4000){chunks.push(part);part='';bytes=0;}part+=character;bytes+=size;}
  if(part)chunks.push(part);
  return chunks;
}
