---
name: gold-unittest-debugger
title: Python Unit Test Fixer & Verification Runner
tags: [unittest, test, repair, debug, calculator, sort]
---

# Python Unit Test Fixer & Verification Runner

```python
import subprocess

def run_and_verify_test(test_target):
    module = test_target[:-3] if test_target.endswith('.py') else test_target
    res = subprocess.run(['python3', '-m', 'unittest', module], capture_output=True, text=True)
    return res.returncode == 0 and ('OK' in res.stderr or 'OK' in res.stdout or 'Ran' in res.stderr)

```
