import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {decodeDocument,documentChunks,extractDocument} from '../lib/documents.mjs';
test('document input rejects binary, malformed UTF-8, empty and oversized text',()=>{
 for(const value of [Buffer.from([255]),Buffer.from([0]),Buffer.from('   '),Buffer.from('a'.repeat(24001))])assert.throws(()=>decodeDocument(value));
 const code='import os\nos.remove("file")';assert.equal(decodeDocument(Buffer.from(code)),code);
 const text='🦇'.repeat(3000);const chunks=documentChunks(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(c=>Buffer.byteLength(c)<=4000));
});
test('extract text and DOCX without executing contents, reject archive entities',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'local-lab-doc-test-'));
 try {
  const text=path.join(dir,'text');await writeFile(text,'The launch date is November 12.');assert.equal(await extractDocument(text,'notes.md'),'The launch date is November 12.');
  const doc=path.join(dir,'document');
  execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("word/document.xml",\'<w:document xmlns:w="urn:word"><w:p><w:t>Launch November 12</w:t></w:p></w:document>\'); z.close()',doc]);
  assert.equal(await extractDocument(doc,'notes.docx'),'Launch November 12');
  execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("word/document.xml",\'<!DOCTYPE x><x/>\'); z.close()',doc]);
  await assert.rejects(extractDocument(doc,'notes.docx'),/entities/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('XLSX preserves cell references and marks cached formulas',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'local-lab-sheet-test-'));const file=path.join(dir,'workbook');
 try {
 execFileSync('python3',['-c',`import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c r="A1" t="inlineStr"><is><t>Sales</t></is></c><c r="B1"><v>42</v></c><c r="C1"><f>B1*2</f><v>84</v></c></row></sheetData></worksheet>')`,file]);
 const text=await extractDocument(file,'sales.xlsx');assert.match(text,/A1: Sales/);assert.match(text,/B1: 42/);assert.match(text,/cached value\] 84/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('PDF extraction reads actual text when pypdf is installed',async t=>{
 try{execFileSync('python3',['-c','import pypdf'],{stdio:'ignore'});}catch{t.skip('pypdf not installed');return;}
 const dir=await mkdtemp(path.join(tmpdir(),'local-lab-pdf-test-'));const file=path.join(dir,'document');
 try {
 execFileSync('python3',['-c',`from pypdf import PdfWriter
from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
import sys
w=PdfWriter();p=w.add_blank_page(400,400)
f=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
p[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):w._add_object(f)})})
s=DecodedStreamObject();s.set_data(b'BT /F1 12 Tf 10 300 Td (Launch November 12) Tj ET');p[NameObject('/Contents')]=w._add_object(s)
w.write(sys.argv[1])`,file]);
 assert.match(await extractDocument(file,'launch.pdf'),/Launch November 12/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
