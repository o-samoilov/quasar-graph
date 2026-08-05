---
name: stripe
kind: external_service
type: stripe
host: api.stripe.com
consumers:
  - project: acme-backend
    env: STRIPE_KEY
---

# stripe

Subscription billing.
