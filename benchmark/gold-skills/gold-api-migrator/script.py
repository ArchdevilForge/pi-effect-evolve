def migrate_call(api, resource, value):
    return getattr(api, 'fetch_' + resource)(value)