import subprocess, sys
res = subprocess.run(['python3', '-m', 'unittest', 'test_legacy_client.py'], capture_output=True, text=True)
if res.returncode == 0 and 'OK' in res.stderr:
    print('VERIFIER_PASS')
    sys.exit(0)
print(f'VERIFIER_FAIL: {res.stderr}')
sys.exit(1)
