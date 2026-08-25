import json
import re

def extract_root_cause(input_path, output_path):
    text = open(input_path).read()
    file_name = re.findall(r'File "([^"]+)", line (\d+)', text)[-1]
    error = re.findall(r'^([A-Za-z_]+Error):', text, re.MULTILINE)[-1]
    result = {'error': error, 'file': file_name[0], 'line': int(file_name[1])}
    json.dump(result, open(output_path, 'w'), indent=2)
    return result