"""Conservative same-brand duplicate suppression for accepted detection counts."""
def suppress_same_brand_duplicates(instances):
    kept, suppressed = [], []
    for instance in sorted(instances, key=lambda x: x['detectorScore'], reverse=True):
        duplicate = None
        if instance['status'] == 'accepted':
            a = instance['box']
            area_a = max(0, a[2]-a[0])*max(0, a[3]-a[1])
            for other in kept:
                if other['status'] != 'accepted' or other['label'] != instance['label']:
                    continue
                b = other['box']
                area_b = max(0, b[2]-b[0])*max(0, b[3]-b[1])
                overlap = max(0, min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
                if overlap/max(1,min(area_a,area_b)) >= .85:
                    duplicate = other['id']
                    break
        if duplicate is None:
            kept.append(instance)
        else:
            suppressed.append({**instance, 'reason':'Contained same-brand proposal; possible duplicate, excluded from counts', 'duplicateOf':duplicate})
    return kept, suppressed
