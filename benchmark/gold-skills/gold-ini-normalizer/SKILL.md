---
name: gold-ini-normalizer
title: INI Section Normalizer
tags: [ini, config, normalize, sections]
---

# INI Section Normalizer

import configparser
import json

def normalize_ini(input_path, output_path):
    parser = configparser.ConfigParser()
    parser.read(input_path)
    data = {section: dict(parser[section]) for section in parser.sections()}
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    return data