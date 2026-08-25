---
name: gold-xml-extractor
title: XML Inventory Extractor
tags: [xml, extract, inventory, catalog]
---

# XML Inventory Extractor

import json
import xml.etree.ElementTree as ET

def extract_active_items(input_path, output_path):
    root = ET.parse(input_path).getroot()
    items = []
    for node in root:
        active = node.get('active') == 'true' or node.get('status') == 'in_stock' or node.get('available') == 'true'
        if active:
            item = dict(node.attrib)
            item.update({child.tag: child.text for child in node})
            items.append(item)
    with open(output_path, 'w') as f:
        json.dump(items, f, indent=2)
    return items