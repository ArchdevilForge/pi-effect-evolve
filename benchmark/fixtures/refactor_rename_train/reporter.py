def build_report(rows):
    return {'count': len(rows), 'total': sum(rows)}

def main(rows):
    return build_report(rows)
