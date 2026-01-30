# Security Verification Checklist

Last verified: 30 January 2026

## Critical Security Fixes

### 1. /api/run-migration Endpoint Removed ✅

**Status:** PASSED

**Test:** `curl -s https://correspondence-clerk.vercel.app/api/run-migration`

**Expected:** 404 Not Found

**Result:** Returns 404 page

**Risk mitigated:** Previously, any HTTP POST could execute database migrations using the service role key without authentication.

---

### 2. Admin Route Protection ✅

**Status:** PASSED

**Test:** Access `/admin/import` without authentication

**Expected:** Redirect to `/login`

**Result:** Server returns `NEXT_REDIRECT;replace;/login;307;`

**Protection layers:**
- `requireAdmin()` in server component checks authentication
- If not logged in → redirect to `/login`
- If logged in but not admin → redirect to `/dashboard?error=unauthorized`
- Server actions also check `isAdmin()` before executing

**Routes protected:**
- `/admin/import`
- `/admin/import-google-docs`

**Actions protected:**
- `importMastersheet()`
- `importGoogleDocsData()`

---

### 3. Rate Limiting ✅

**Status:** IMPLEMENTED (Supabase-backed)

**Endpoints protected:**
| Endpoint | Limit | Window |
|----------|-------|--------|
| AI Formatter | 20 requests | 1 minute |
| Search | 30 requests | 1 minute |
| Email Import | 60 requests | 1 minute |

**Implementation notes:**
- Rate limits stored in Supabase `rate_limits` table
- Works across serverless instances (unlike in-memory)
- Fails open if rate limit check fails (allows request)
- Cleanup runs daily at 01:00 UTC via Vercel Cron

**Limitations on Vercel:**
- Hobby plan only allows daily cron jobs (not hourly)
- Cleanup runs once per day, so expired entries may persist up to 24 hours
- For high-traffic production, consider:
  - Upgrading to Vercel Pro for hourly cleanup
  - Using Upstash Redis for faster rate limiting
  - Implementing client-side rate limiting as first defense

---

### 4. Audit Logging ✅

**Status:** IMPLEMENTED

**Actions logged:**
- `import_mastersheet` - CSV import operations
- `import_google_docs` - Google Docs import operations

**Data captured:**
- `user_id` - Who performed the action
- `organization_id` - Which organization
- `action` - Type of action
- `status` - success/failure/partial
- `metadata` - Record counts, errors, timestamps
- `created_at` - When it happened

**Access:**
- Only admins can view audit logs for their organization
- Logs stored in `audit_logs` table with RLS

---

### 5. Email Delivery ✅

**Status:** IMPLEMENTED (SendGrid optional)

**Behavior:**
- If `SENDGRID_API_KEY` set → sends real emails
- If not set → logs to console (visible in Vercel function logs)

**Environment variables:**
- `SENDGRID_API_KEY` - API key (optional)
- `SENDGRID_FROM_EMAIL` - Sender address (default: noreply@correspondenceclerk.com)

---

## Database Migrations Required

Run these in Supabase SQL Editor before the features work:

1. `20260130_001_add_user_roles.sql` - User roles (member/admin)
2. `20260130_002_add_rate_limits_table.sql` - Rate limiting table
3. `20260130_003_add_audit_logs_table.sql` - Audit logging table

---

## Verification Commands

```bash
# Check /api/run-migration is gone
curl -s -w "%{http_code}" https://correspondence-clerk.vercel.app/api/run-migration

# Check admin redirect (look for NEXT_REDIRECT in response)
curl -s https://correspondence-clerk.vercel.app/admin/import | grep -o "NEXT_REDIRECT[^\"]*"

# Check rate limit cleanup endpoint
curl -s https://correspondence-clerk.vercel.app/api/cleanup-rate-limits
```

---

## Known Limitations

1. **Rate limit cleanup frequency:** Vercel Hobby limits cron to daily. Expired entries may persist up to 24 hours.

2. **Rate limit bypass:** Currently uses user ID as identifier. Anonymous/unauthenticated requests all share one bucket.

3. **Audit log retention:** No automatic cleanup. Consider adding retention policy for production.

4. **IP logging:** Not currently captured in audit logs. Would require forwarded header parsing.

---

## Future Improvements

- [ ] Add IP-based rate limiting for unauthenticated endpoints
- [ ] Implement audit log retention policy (e.g., 90 days)
- [ ] Add rate limiting to more endpoints (correspondence creation, etc.)
- [ ] Consider Upstash Redis for lower-latency rate limiting
- [ ] Add email notifications for suspicious activity
