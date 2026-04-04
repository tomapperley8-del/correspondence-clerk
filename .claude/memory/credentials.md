---
name: Credentials & Expiry Dates
description: OAuth tokens, API keys, and when they expire — check before they lapse
type: reference
---

- **MICROSOFT_CLIENT_SECRET expires 19/09/2026** — rotate at portal.azure.com → App registrations → Correspondence Clerk → Certificates & secrets
- **Google OAuth** — Cloud project `decisive-talon-484209-i9`, account tomapperley8@gmail.com, secret ends `QMUF`
- **Microsoft OAuth** — Azure app "Correspondence Clerk", account info@thechiswickcalendar.co.uk
- **Forward Email** — $3/month Enhanced Protection, domain `correspondenceclerk.com` verified. Webhook: `https://correspondence-clerk.vercel.app/api/inbound-email`
- **Resend** — domain verified (eu-west-1). `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set in Vercel production.
- **Supabase** — project ID `ayoiibrzkllerrwbhvda`
- **Vercel** — project `correspondence-clerk` (prj_TLkqSYexjPOdnZNKJGGcq3AGpSO9), tom-apperleys-projects org
- Full details: `project_oauth_credentials.md` in project root
