import csv
import json

def find_anomalies(input_path, output_path):
    with open(input_path, newline='') as f:
        rows = list(csv.DictReader(f))
    result = [row['service'] for row in rows if float(row['error_rate']) > 5 or float(row['latency_ms']) > 500]
    json.dump(result, open(output_path, 'w'), indent=2)
    return result