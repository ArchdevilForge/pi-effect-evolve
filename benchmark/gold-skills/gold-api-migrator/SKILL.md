---
name: gold-api-migrator
title: Client API Method Migration
tags: [api, migration, client, refactor]
---

# Client API Method Migration

def migrate_call(api, resource, value):
    return getattr(api, 'fetch_' + resource)(value)