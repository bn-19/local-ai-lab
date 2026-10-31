import test from 'node:test';import assert from 'node:assert/strict';
import {answerDocument,assertDocumentAnswer,sourcePieces} from '../lib/document-answer.mjs';
test('bounded document context preserves source offsets and rejects planning output',()=>{
 const text='Page 1\n'+('é'.repeat(2000));const pieces=sourcePieces(text);
 assert.equal(pieces.map(p=>p.text).join(''),text);assert.ok(pieces.every(p=>Buffer.byteLength(p.text)<=1700));
 assert.equal(pieces.at(-1).end,text.length);assert.throws(()=>assertDocumentAnswer({answer:'I need to summarize...'}),/planning text/);
});
test('document synthesis sees every part and abort prevents final answer',async()=>{
 let final;const signal=new AbortController();
 const result=await answerDocument({text:'Page 1\n'+('x'.repeat(4100)),request:'Summarize this',signal:signal.signal,progress:async()=>{},generate:async(system,input)=>{if(input.evidence){final=input.evidence;return {value:{answer:'The source contains extracted material.'}};}return {value:{quotes:[input.excerpt.slice(0,20)]}};}});
 assert.equal(result.parts.length,2);assert.equal(final.length,result.synthesis.evidenceNotes);assert.ok(final.some(n=>n.part===2));
 signal.abort();await assert.rejects(answerDocument({text:'Some text',request:'Summarize',signal:signal.signal,progress:async()=>{},generate:async()=>{throw Error('must not run');}}),/abort/i);
});
test('short document uses the full source directly and rejects invented numbers',async()=>{
 const text='Page 1\nThe wavelength is 0.6 to 28.5 microns.';let supplied;
 const result=await answerDocument({text,request:'Summarize wavelength',context:8192,signal:new AbortController().signal,progress:async()=>{},generate:async(system,input)=>{supplied=input.document;return {value:{answer:'The wavelength is 0.6 to 28.5 microns (Page 1).'}};}});
 assert.equal(supplied,text);assert.equal(result.synthesis.evidenceNotes,0);
 await assert.rejects(answerDocument({text,request:'Summarize wavelength',context:8192,signal:new AbortController().signal,progress:async()=>{},generate:async()=>({value:{answer:'The wavelength ends at 2.85 microns.'}})}),/number absent/);
});
