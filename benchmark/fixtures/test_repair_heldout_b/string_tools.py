def normalize_name(value):
    # BUG: loses the requested title casing
    return value.lower().strip()
