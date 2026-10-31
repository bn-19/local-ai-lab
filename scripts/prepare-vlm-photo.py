"""Deterministic whole-photo resolution budget; never crops or changes originals."""
import hashlib,json,math,os,sys,warnings
from pathlib import Path
from PIL import Image,ImageOps
Image.MAX_IMAGE_PIXELS=20_000_000
warnings.simplefilter('error',Image.DecompressionBombWarning)
def prepare(source,destination,metadata):
 source,destination,metadata=map(Path,(source,destination,metadata))
 original=source.read_bytes()
 if len(original)>8*1024*1024:raise ValueError('Photo limit is 8 MB')
 with Image.open(source)as im:
  if im.format not in ('JPEG','PNG')or getattr(im,'n_frames',1)!=1 or im.width*im.height>20_000_000:raise ValueError('Use a single JPEG/PNG up to 20 MP')
  source_size=list(im.size);im.load();im=ImageOps.exif_transpose(im);oriented_size=list(im.size)
  if im.mode in ('RGBA','LA')or(im.mode=='P'and 'transparency'in im.info):
   rgba=im.convert('RGBA');background=Image.new('RGBA',rgba.size,'white');background.alpha_composite(rgba);im=background.convert('RGB')
  else:im=im.convert('RGB')
  scale=min(1,1280/im.width,1280/im.height,math.sqrt(1_500_000/(im.width*im.height)))
  size=(max(1,math.floor(im.width*scale)),max(1,math.floor(im.height*scale)))
  if size!=im.size:im=im.resize(size,Image.Resampling.LANCZOS)
  with destination.open('xb')as f:im.save(f,format='JPEG',quality=90,subsampling=0,optimize=False,progressive=False)
 os.chmod(destination,0o600);derived=destination.read_bytes()
 result={'sourceSHA256':hashlib.sha256(original).hexdigest(),'derivedSHA256':hashlib.sha256(derived).hexdigest(),'sourceDimensions':source_size,'orientedDimensions':oriented_size,'inputDimensions':list(size),'sourceBytes':len(original),'derivedBytes':len(derived),'policy':{'longEdge':1280,'maxPixels':1500000,'exifTranspose':True,'crop':False,'jpegQuality':90,'subsampling':0,'alphaBackground':'white'},'originalPreserved':True}
 with metadata.open('x')as f:json.dump(result,f,indent=2)
 os.chmod(metadata,0o600);return result
if __name__=='__main__':prepare(*sys.argv[1:4])
