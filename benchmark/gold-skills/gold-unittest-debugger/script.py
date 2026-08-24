import subprocess

def run_and_verify_test(test_module):
    res = subprocess.run(['python3', '-m', 'unittest', test_module], capture_output=True, text=True)
    return res.returncode == 0 and 'OK' in res.stderr
