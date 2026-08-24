---
name: gold-log-parser
title: Regex Exception Log Aggregator & Traceback Extractor
tags: [log, diagnosis, traceback, exception, regex, summary]
---

# Regex Exception Log Aggregator & Traceback Extractor

```python
import re, json
def parse_log_exceptions(log_path):
    errors = {}
    with open(log_path) as f:
        for line in f:
            m = re.search(r'ERROR (\w+Error|\w+Exception)', line)
            if m:
                err = m.group(1)
                errors[err] = errors.get(err, 0) + 1
    return errors

```
