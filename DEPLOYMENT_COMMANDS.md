# Deployment Commands - Quick Reference

Quick reference for deploying Correspondence Clerk to Vercel.

---

## 🌐 Production Info

**URL:** https://correspondence-clerk.vercel.app
**Platform:** Vercel
**Organization:** tom-apperleys-projects
**Project:** correspondence-clerk

---

## 🚀 Deploy to Production

### Method 1: Auto-Deploy (Recommended)

Push to GitHub main branch:
```bash
git add .
git commit -m "your commit message"
git push origin main
```

Vercel automatically detects the push and deploys in ~1-2 minutes.

### Method 2: Manual Deploy with Vercel CLI

```bash
cd C:\Users\Bridg\Projects\correspondence-clerk
vercel --prod --yes
```

Deploys immediately, takes ~30-60 seconds.

---

## 📋 Pre-Deployment Checklist

Before deploying:
- ✅ Code builds locally: `npm run build`
- ✅ No TypeScript errors: `npm run lint`
- ✅ Tests pass (if applicable): `npx tsx scripts/test-ai-formatting.ts`
- ✅ Environment variables set in Vercel dashboard
- ✅ Database migrations applied to Supabase

---

## 🔐 Environment Variables

Set in Vercel Dashboard → Settings → Environment Variables

**Required:**
```
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=https://correspondence-clerk.vercel.app
```

**Note:** These are already configured. Don't change unless needed.

---

## 📊 Deployment Status

### Check Deployment Status

**Vercel Dashboard:**
https://vercel.com/tom-apperleys-projects/correspondence-clerk

**Via CLI:**
```bash
vercel ls correspondence-clerk
```

### View Logs

**Production logs:**
```bash
vercel logs correspondence-clerk --prod
```

**Specific deployment:**
```bash
vercel logs [deployment-url]
```

---

## 🐛 Troubleshooting

### Build Fails

**Check build logs:**
1. Go to Vercel dashboard
2. Click on failed deployment
3. View "Build Logs" tab

**Common fixes:**
```bash
# Clear local build cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Test build locally
npm run build
```

### Environment Variable Issues

**Verify variables are set:**
1. Vercel Dashboard → Settings → Environment Variables
2. Check all required variables are present
3. Redeploy after updating variables

### Database Connection Issues

**Check Supabase:**
1. Verify database is running
2. Check RLS policies are applied
3. Verify connection strings are correct
4. Test connection locally first

---

## 🔄 Rollback

### Rollback to Previous Deployment

**Via Dashboard:**
1. Go to Vercel Dashboard → Deployments
2. Find previous successful deployment
3. Click "..." → "Promote to Production"

**Via CLI:**
```bash
# List recent deployments
vercel ls correspondence-clerk

# Promote specific deployment to production
vercel promote [deployment-url] --scope=tom-apperleys-projects
```

### Rollback via Git

```bash
# Revert last commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard [commit-hash]
git push origin main --force  # ⚠️ Use with caution
```

---

## 📈 Post-Deployment

### Verify Deployment

**Check these after deploying:**
1. ✅ Site loads: https://correspondence-clerk.vercel.app
2. ✅ Login works
3. ✅ Dashboard loads
4. ✅ Can create new entry
5. ✅ AI formatting works
6. ✅ Search works

**Quick Smoke Test:**
```bash
# Test AI formatting (requires ANTHROPIC_API_KEY locally)
npx tsx scripts/test-ai-formatting.ts
```

### Monitor

**Check for errors:**
1. Vercel Dashboard → Functions → View logs
2. Look for 5xx errors
3. Check AI formatting success rate

**Expected metrics:**
- Response time: <3s for pages
- AI formatting: 99%+ success rate
- Zero JSON parsing errors

---

## 🚨 Emergency Procedures

### Site is Down

1. **Check Vercel Status:** https://vercel-status.com
2. **Check build logs** in Vercel Dashboard
3. **Rollback** to last known good deployment
4. **Contact support** if Vercel issue

### AI Formatting Broken

1. **Check Anthropic API status:** https://status.anthropic.com
2. **Verify ANTHROPIC_API_KEY** in Vercel environment variables
3. **Check function logs** for error messages
4. **Users can still save** (fallback to unformatted)

### Database Issues

1. **Check Supabase Dashboard:** https://supabase.com/dashboard
2. **Verify migrations** are applied
3. **Check connection strings** in environment variables
4. **Test with Supabase CLI:** `npx supabase status`

---

## 📞 Support Contacts

**Vercel:**
- Dashboard: https://vercel.com/tom-apperleys-projects
- Docs: https://vercel.com/docs
- Status: https://vercel-status.com

**Supabase:**
- Dashboard: https://supabase.com/dashboard
- Docs: https://supabase.com/docs
- Status: https://status.supabase.com

**Anthropic:**
- Dashboard: https://console.anthropic.com
- Docs: https://docs.anthropic.com
- Status: https://status.anthropic.com

---

## 📝 Deployment History

### January 22, 2026
- **Feature:** Eliminated AI formatting errors with structured outputs
- **Changes:**
  - Upgraded to claude-sonnet-4-5
  - Increased token budget to 16,384
  - Added JSON schema enforcement
  - 100% test success rate
- **Commits:** 59d0ca8, a45ed2f, 133dfd8, ccba3ab

### January 16, 2026
- **Feature:** Completed all 9 steps (export to Google Docs)
- **Status:** Full v1.0 functionality

---

**Last Updated:** January 22, 2026
