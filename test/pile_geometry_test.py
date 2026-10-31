import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from pile_geometry import suppress_same_brand_duplicates
class DuplicateCountingTests(unittest.TestCase):
 def instance(self,i,box,score=.4,label='100 Grand',status='accepted'):
  return dict(id=i,box=box,detectorScore=score,label=label,status=status)
 def test_observed_nested_wrapper_is_one_countable_instance(self):
  outer=self.instance(4,[260.8,376.5,605.4,685.9],.4345)
  inner=self.instance(5,[313.8,427.4,539.9,617.2],.2736)
  kept,removed=suppress_same_brand_duplicates([inner,outer])
  self.assertEqual([x['id']for x in kept],[4]);self.assertEqual(removed[0]['duplicateOf'],4)
 def test_distinct_same_brand_instances_survive(self):
  rows=[self.instance(1,[0,0,100,100]),self.instance(2,[80,0,180,100])]
  self.assertEqual(suppress_same_brand_duplicates(rows),(rows,[]))
 def test_different_or_uncertain_labels_are_not_silently_removed(self):
  rows=[self.instance(1,[0,0,100,100]),self.instance(2,[10,10,90,90],label='Twix'),self.instance(3,[20,20,70,70],status='uncertain')]
  self.assertEqual(suppress_same_brand_duplicates(rows),(rows,[]))
if __name__=='__main__':unittest.main()
