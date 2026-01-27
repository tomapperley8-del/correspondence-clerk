# Multi-Tenancy Migration Guide

This guide provides step-by-step instructions for deploying the multi-tenancy feature to production with zero downtime.

## Overview

The multi-tenancy implementation adds organization-based data isolation to Correspondence Clerk. Each organization has completely isolated data, and users can invite team members to join their organization.

### Key Changes

- **7 database migrations** that add organizations, user profiles, invitations, and organization_id to all data tables
- **Complete RLS policy rewrite** for organization-scoped access control
- **Onboarding flow** for new users to create or join organizations
- **Invitation system** with secure token-based team member invitations
- **Data migration** that assigns all existing data to "The Chiswick Calendar" organization

## Pre-Migration Checklist

- [ ] **Backup database**: Create a complete backup of your production database
- [ ] **Test in staging**: Run all migrations in a staging environment with production data copy
- [ ] **Verify RLS policies**: Test that RLS policies prevent cross-organization access
- [ ] **Review code changes**: All server actions now include organization_id on INSERT
- [ ] **Set environment variable**: Ensure `NEXT_PUBLIC_APP_URL` is set for invitation links
- [ ] **Prepare rollback plan**: Have migration 007 rollback SQL ready

## Migration Sequence

Run migrations in this exact order:

### Step 1: Create Organizations Table
```bash
# Migration: 20260120_001_create_organizations_table.sql
```

**What it does:**
- Creates `organizations` table with auto-update triggers
- No impact on existing data
- Safe to run anytime

### Step 2: Create User Profiles Table
```bash
# Migration: 20260120_002_create_user_profiles_table.sql
```

**What it does:**
- Creates `user_profiles` table linking users to organizations
- One-to-one relationship (one user = one organization)
- No impact on existing data

### Step 3: Create Invitations Table
```bash
# Migration: 20260120_003_create_invitations_table.sql
```

**What it does:**
- Creates `invitations` table with status enum
- 256-bit secure tokens, 7-day expiry
- Unique constraint prevents duplicate pending invitations
- No impact on existing data

### Step 4: Add organization_id Columns
```bash
# Migration: 20260120_004_add_organization_id_to_data_tables.sql
```

**What it does:**
- Adds nullable `organization_id` column to: businesses, contacts, correspondence
- Creates indexes for RLS performance
- **IMPORTANT**: Columns are nullable initially to allow zero-downtime deployment

**Verify:**
```sql
-- Check columns were added
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name IN ('businesses', 'contacts', 'correspondence')
  AND column_name = 'organization_id';
-- Expected: 3 rows, all is_nullable = 'YES'
```

### Step 5: Migrate Existing Data
```bash
# Migration: 20260120_005_migrate_existing_data.sql
```

**What it does:**
- Creates "The Chiswick Calendar" organization (fixed UUID: 00000000-0000-0000-0000-000000000001)
- Creates user_profiles for all existing auth.users → Chiswick Calendar
- Updates all businesses, contacts, correspondence → Chiswick Calendar
- Makes organization_id NOT NULL (enforces data integrity)

**CRITICAL**: This migration is idempotent and can be safely re-run if needed.

**Verify:**
```sql
-- Check organization was created
SELECT id, name FROM organizations
WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: 1 row

-- Check all users have profiles
SELECT COUNT(*) FROM auth.users;
SELECT COUNT(*) FROM user_profiles;
-- Expected: Both counts should match

-- Check all data has organization_id
SELECT COUNT(*) FROM businesses WHERE organization_id IS NULL;
SELECT COUNT(*) FROM contacts WHERE organization_id IS NULL;
SELECT COUNT(*) FROM correspondence WHERE organization_id IS NULL;
-- Expected: All should be 0
```

### Step 6: Create RLS Helper Function
```bash
# Migration: 20260120_006_create_rls_helpers.sql
```

**What it does:**
- Creates `get_user_organization_id()` function
- STABLE for query performance (result cached within query)
- SECURITY DEFINER to allow reading user_profiles

**Verify:**
```sql
-- Test function works
SELECT get_user_organization_id();
-- Expected: Returns your organization_id if logged in
```

### Step 7: Update RLS Policies (CRITICAL SWITCHOVER)
```bash
# Migration: 20260120_007_update_rls_policies.sql
```

**What it does:**
- Drops ALL existing "all users can access all data" policies
- Creates new organization-scoped RLS policies
- **THIS IS THE CRITICAL SECURITY CHANGE**

**⚠️ IMPORTANT**: After this migration, data isolation is enforced. Test immediately.

**Verify RLS policies work:**
```sql
-- As user in Chiswick Calendar org
SELECT COUNT(*) FROM businesses;
-- Expected: See all Chiswick Calendar businesses

-- Create test organization in psql
INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'Test Org');
-- As that user, should see 0 businesses (isolated)
```

### Step 8: Deploy Application Code

**Deploy the new application code that:**
- Includes organization_id in all INSERT operations
- Adds onboarding flow
- Adds organization settings page
- Updates navigation with org name

**Deployment checklist:**
- [ ] Deploy to staging first
- [ ] Verify new users can create organizations
- [ ] Verify invitations work end-to-end
- [ ] Verify existing users still see their data
- [ ] Check error logs for any RLS violations

## Post-Migration Verification

### Test Data Isolation

1. **Create a test organization**
   - Sign up with a new email
   - Create organization "Test Company"
   - Create a test business

2. **Verify isolation**
   - Log in as existing Chiswick Calendar user
   - Verify you CANNOT see "Test Company" businesses
   - Verify Test Company user CANNOT see Chiswick Calendar businesses

3. **Test invitations**
   - As Chiswick Calendar user, invite a new email
   - Check console logs for invitation URL (MVP stub)
   - Accept invitation as new user
   - Verify new user can see Chiswick Calendar data

### Performance Testing

Run EXPLAIN ANALYZE on key queries:

```sql
-- Should use organization_id index
EXPLAIN ANALYZE
SELECT * FROM businesses
WHERE organization_id = get_user_organization_id();

-- Verify index is used
-- Look for "Index Scan using idx_businesses_organization_id"
```

### Security Verification Checklist

- [ ] User cannot read other organization's businesses
- [ ] User cannot read other organization's contacts
- [ ] User cannot read other organization's correspondence
- [ ] User cannot modify their own organization_id in user_profiles
- [ ] User cannot create records with different organization_id
- [ ] Invitation tokens are cryptographically secure (64 hex chars)
- [ ] Expired invitations cannot be accepted
- [ ] Used invitations cannot be reused

## Rollback Plan

If critical issues occur after Step 7 (RLS policy update):

### Emergency Rollback SQL

```sql
-- ROLLBACK: Restore open access policies
-- WARNING: This removes data isolation temporarily

-- Businesses
DROP POLICY IF EXISTS "Users can read own organization businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can insert own organization businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can update own organization businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can delete own organization businesses" ON public.businesses;

CREATE POLICY "Authenticated users can read all businesses"
  ON public.businesses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert businesses"
  ON public.businesses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update all businesses"
  ON public.businesses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete businesses"
  ON public.businesses FOR DELETE TO authenticated USING (true);

-- Repeat for contacts and correspondence tables...
```

### Full Rollback (Nuclear Option)

If complete rollback is needed:

1. Restore database from backup taken in pre-migration
2. Redeploy previous application code
3. Investigate issues in staging

## Troubleshooting

### Issue: Users cannot see their data after migration

**Check:**
```sql
-- Verify user has profile
SELECT * FROM user_profiles WHERE id = '<user_id>';

-- Check organization_id on data
SELECT organization_id, COUNT(*)
FROM businesses
GROUP BY organization_id;
```

**Fix:**
- Ensure user_profile was created for the user
- Verify organization_id matches between profile and data

### Issue: New records fail with "null value in column organization_id"

**Check:**
- Application code is deployed
- Server actions include getCurrentUserOrganizationId()

**Fix:**
- Deploy latest application code
- Check server action logs for errors

### Issue: RLS policy errors in logs

**Check:**
```sql
-- Find RLS-related errors
SELECT * FROM pg_stat_statements
WHERE query LIKE '%RLS%';
```

**Fix:**
- Verify RLS helper function is created
- Check user has valid organization_id in user_profiles

## Production Rollout Recommendations

### Timing

- **Best time**: Low-traffic period (e.g., weekend, late evening)
- **Expected downtime**: None (zero-downtime migrations)
- **Monitoring period**: 24 hours of close monitoring after switchover

### Monitoring

Monitor these metrics for 24 hours:

- Error rate (should not increase)
- Query performance (should remain similar)
- Auth errors (RLS violations would show here)
- New user signups (test onboarding flow)

### Communication

**Notify users:**
- "We're adding team collaboration features"
- "You may need to log in again after the update"
- "Invite team members from Settings > Organization"

## Email Service Setup (Post-Migration)

The MVP uses console.log for invitation URLs. For production:

### Replace lib/email.ts with real email service:

**Option 1: SendGrid**
```typescript
import sgMail from '@sendgrid/mail'
sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export async function sendInvitationEmail(email: string, token: string, orgName: string) {
  await sgMail.send({
    to: email,
    from: 'noreply@yourapp.com',
    subject: `You've been invited to join ${orgName}`,
    html: `<p>Click <a href="${baseUrl}/invite/accept?token=${token}">here</a> to accept</p>`,
  })
}
```

**Option 2: AWS SES**
```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
// Implementation similar to SendGrid
```

## Success Criteria

✅ All migrations applied successfully
✅ All existing users can access their data
✅ New users can create organizations
✅ Invitations work end-to-end
✅ Data is completely isolated between organizations
✅ No performance regression on key queries
✅ No increase in error rate
✅ RLS policies prevent cross-organization access

## Support

If issues arise during migration:

1. Check error logs in Supabase dashboard
2. Run verification SQL queries above
3. Review RLS policies in Supabase Table Editor
4. Use rollback plan if critical issue found
5. Test in staging with production data copy

---

**Migration prepared by:** Claude Code
**Date:** January 20, 2026
**Version:** Multi-Tenancy v1.0
