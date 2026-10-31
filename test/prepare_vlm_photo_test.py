import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).resolve().parents[1]/'scripts/prepare-vlm-photo.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PhotoBudgetTests(unittest.TestCase):
 def test_bounded_deterministic_copy_preserves_original(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);source=p/'source.png';Image.new('RGB',(2000,1000),(32,96,160)).save(source);original=source.read_bytes()
   a=module.prepare(source,p/'a.jpg',p/'a.json');b=module.prepare(source,p/'b.jpg',p/'b.json')
   self.assertEqual(source.read_bytes(),original);self.assertEqual(a['sourceSHA256'],hashlib.sha256(original).hexdigest());self.assertEqual(a['inputDimensions'],[1280,640]);self.assertEqual(a['derivedSHA256'],b['derivedSHA256']);self.assertEqual(a['derivedSHA256'],hashlib.sha256((p/'a.jpg').read_bytes()).hexdigest())
 def test_exif_orientation_is_applied_without_upscaling(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);source=p/'source.jpg';im=Image.new('RGB',(20,10));exif=Image.Exif();exif[274]=6;im.save(source,exif=exif);r=module.prepare(source,p/'a.jpg',p/'a.json');self.assertEqual(r['sourceDimensions'],[20,10]);self.assertEqual(r['inputDimensions'],[10,20]);
   with Image.open(p/'a.jpg')as prepared:self.assertIsNone(prepared.getexif().get(274))
if __name__=='__main__':unittest.main()
