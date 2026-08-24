---
name: gold-unittest-debugger
title: Python Unit Test Fixer & Verification Runner
tags: [unittest, test, repair, debug, calculator, sort]
---

# Python Unit Test Fixer & Verification Runner

```python
import subprocess
def run_tests(test_file):
    return subprocess.run(['python3', '-m', 'unittest', test_file], capture_output=True, text=True)

```
