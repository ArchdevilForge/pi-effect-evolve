import json

def extract_matching_devices(input_path, output_path, status_filter='online'):
    with open(input_path) as f:
        root = json.load(f)
    items = []
    for cluster in root.get('clusters', []):
        for dev in cluster.get('devices', []):
            if dev.get('status') == status_filter:
                items.append({
                    'deviceId': dev.get('deviceId'),
                    'model': dev.get('model'),
                    'ipAddress': dev.get('network', {}).get('ipAddress')
                })
    with open(output_path, 'w') as f:
        json.dump(items, f, indent=2)
    return items
