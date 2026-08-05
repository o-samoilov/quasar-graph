---
name: mongodb-acme
kind: database
type: mongodb
port: 27017
admin_url: http://localhost:8081
consumers:
  - project: acme-backend
    env: MONGODB_URL
---

# mongodb-acme

Primary application database.
