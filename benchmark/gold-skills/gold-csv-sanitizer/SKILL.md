---
name: gold-csv-sanitizer
title: RFC 4180 CSV Normalizer & Delimiter Sanitizer
tags: [csv, cleanup, delimiter, quotes, sanitizer]
---

# RFC 4180 CSV Normalizer & Delimiter Sanitizer

```python
import csv
def sanitize_csv(src_file, dst_file, delimiter=';'):
    with open(src_file, newline='') as f:
        reader = csv.reader(f, delimiter=delimiter)
        rows = [r for r in reader if any(r)]
    with open(dst_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(rows)

```
