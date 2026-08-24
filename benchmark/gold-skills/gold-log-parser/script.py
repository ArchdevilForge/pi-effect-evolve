import re, json

def extract_fatal_cause(log_path, output_path):
    with open(log_path) as f:
        content = f.read()
    line_m = re.search(r'line (\d+)', content)
    err_m = re.search(r'([A-Za-z_]+Error|[A-Za-z_]+Exception)', content)
    file_m = re.search(r'File "([^"]+)"', content)
    result = {
        'error': err_m.group(1) if err_m else 'UnknownError',
        'line': int(line_m.group(1)) if line_m else 0,
        'file': file_m.group(1) if file_m else 'unknown.py'
    }
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)
    return result
