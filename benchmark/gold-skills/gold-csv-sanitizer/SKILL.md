---
name: gold-csv-sanitizer
title: RFC 4180 CSV Normalizer & Delimiter Sanitizer
tags: [csv, cleanup, delimiter, quotes, sanitizer]
---

# RFC 4180 CSV Normalizer & Delimiter Sanitizer

```python
import csv

def clean_delimited_file(src_path, dst_path, in_delimiter='\t'):
    with open(src_path, newline='') as f:
        lines = [line.strip() for line in f if line.strip()]
    rows = [line.split(in_delimiter) for line in lines]
    with open(dst_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    return len(rows)

```
