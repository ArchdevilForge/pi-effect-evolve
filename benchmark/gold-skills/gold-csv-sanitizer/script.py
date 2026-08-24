import csv

def clean_delimited_file(src_path, dst_path, in_delimiter=None):
    with open(src_path, newline='') as f:
        content = f.read()
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not in_delimiter and lines:
        in_delimiter = ';' if ';' in lines[0] else '\t' if '\t' in lines[0] else ','
    rows = [line.split(in_delimiter or ',') for line in lines]
    with open(dst_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    return len(rows)
