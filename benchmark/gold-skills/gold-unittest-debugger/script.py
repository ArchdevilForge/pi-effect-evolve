import subprocess
def run_tests(test_file):
    return subprocess.run(['python3', '-m', 'unittest', test_file], capture_output=True, text=True)
