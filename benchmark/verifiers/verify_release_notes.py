import sys
try:
    text = open('release_notes.md').read()
    assert '## Highlights' in text
    assert '- Added CSV export for reports' in text
    assert '- Fixed login timeout on slow networks' in text
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)
