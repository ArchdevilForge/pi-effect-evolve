---
name: gold-config-auditor
title: JSON Configuration Risk Auditor
tags: [config, audit, security, diagnosis]
---

# JSON Configuration Risk Auditor

import json

def audit_config(input_path, output_path):
    with open(input_path) as f:
        config = json.load(f)
    issues = []
    if config.get('debug') is True: issues.append('debug_enabled')
    if config.get('database', {}).get('ssl') is False: issues.append('database_ssl_disabled')
    if config.get('database', {}).get('password') == 'plaintext': issues.append('plaintext_password')
    with open(output_path, 'w') as f:
        json.dump(issues, f, indent=2)
    return issues