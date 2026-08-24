def add(a, b): return a + b
def divide(a, b):
    # BUG: reversed arguments
    return b / a if a != 0 else 0
