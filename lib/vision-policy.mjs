export const visionModel = Object.freeze({id:'openai/clip-vit-base-patch32',revision:'3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268',sha256:'a63082132ba4f97a80bea76823f544493bffa8082296d62d71581a4feff1576f',bytes:605247071,license:'MIT',runtime:'PyTorch / MPS',scope:'One packaged product per photo. No instance detection or counts.'});
export const visionDataset = Object.freeze({id:'Anilot/MIMEX',revision:'fa7017f07b10efdb4dc461c14b8da1ae8aa01e73',license:'MIT',author:'Anil Osman Tur et al.',source:'https://huggingface.co/datasets/Anilot/MIMEX',paper:'https://arxiv.org/html/2409.14963v1'});
export const visionLabels=['Ferrero Rocher chocolate','Milka chocolate','Kinder chocolate','Toblerone white chocolate','Toblerone dark chocolate'];
export function imageType(bytes){if(bytes.length>8*1024*1024)throw Error('Photo limit is 8 MB');if(bytes.length<16)throw Error('Photo is empty or invalid');if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';throw Error('Choose a JPEG or PNG photo');}
export function visionAction(action){if(!['install','evaluate','predict','install-detector','detect','train-pile-head','detect-friend','install-vlm','detect-vlm'].includes(action))throw Error('Unsupported vision action');return action;}
export function photoDimensions(bytes){
 const type=imageType(bytes);let width,height;
 if(type==='image/png'){
  if(bytes.length<33||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG dimensions');
  width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  for(let i=8;i+12<=bytes.length;){const n=bytes.readUInt32BE(i);if(n>bytes.length-i-12)throw Error('Invalid PNG chunk');if(bytes.toString('ascii',i+4,i+8)==='acTL')throw Error('Use a single-frame photo');i+=n+12;}
 }else{
  let i=2;while(i+4<=bytes.length){if(bytes[i++]!==255)throw Error('Invalid JPEG header');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;if(i+2>bytes.length)break;const n=bytes.readUInt16BE(i);if(n<2||i+n>bytes.length)throw Error('Invalid JPEG segment');if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(n<8)throw Error('Invalid JPEG dimensions');height=bytes.readUInt16BE(i+3);width=bytes.readUInt16BE(i+5);break;}i+=n;}
 }
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>20000||height>20000||width*height>20000000)throw Error('Use a JPEG/PNG photo up to 20 megapixels');return {width,height};
}
