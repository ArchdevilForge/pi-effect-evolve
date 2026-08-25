---
name: gold-release-notes
title: Release Notes From Change List
tags: [release, notes, summary, one-off]
---

# Release Notes From Change List

def build_release_notes(changes):
    lines = ['## Highlights', '']
    lines.extend('- ' + line for line in changes if line.strip())
    return '\n'.join(lines) + '\n'