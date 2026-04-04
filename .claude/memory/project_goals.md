---
name: Project Goals & Vision
description: SaaS vision, current position, target scale, long-term direction
type: project
---

Currently a personal tool for Tom (sole user, The Chiswick Calendar). Long-term goal is a saleable SaaS product. Build for yourself first, validate the core, then productise.

**Why:** All decisions should balance "works for Tom now" against "doesn't paint into corners for multi-tenant future."

**How to apply:** Don't over-engineer for hypothetical users, but always enforce org_id isolation and keep the data model clean. Features should work for 1 org and 50 orgs without refactoring.
