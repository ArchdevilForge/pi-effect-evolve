def build_release_notes(changes):
    lines = ['## Highlights', '']
    lines.extend('- ' + line for line in changes if line.strip())
    return '\n'.join(lines) + '\n'