---
name: acme-backend
language: typescript
framework: nestjs
connections:
  - project: acme-web
    via: rest_api
---

# acme-backend

Core API service for acme.
