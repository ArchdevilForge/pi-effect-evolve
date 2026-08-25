import sys
try:
    text = open('release_notes.md').read()
    assert '## Highlights' in text
    assert '- Added dark mode to the dashboard' in text
    assert '- Fixed duplicate email notifications' in text
    print('VERIFIER_PASS')
    sys.exit(0)
except Exception as e:
    print(f'VERIFIER_FAIL: {e}')
    sys.exit(1)
