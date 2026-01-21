# Correspondence Clerk - Deployment Guide

**Status:** Ready to Deploy ✅
**Date:** January 20, 2026

---

## Pre-Deployment Checklist

- ✅ All changes committed to git
- ✅ Pushed to GitHub (master branch)
- ✅ Production build tested successfully
- ✅ Vercel CLI installed

---

## Deployment to Vercel

### Step 1: Deploy to Vercel

Run the following command in your project directory:

```bash
vercel --prod
```

**What happens next:**

1. **Authentication** - If this is your first time, you'll be prompted to:
   - Log in to Vercel (opens browser)
   - Authorize the CLI

2. **Project Setup** - Vercel will ask:
   - Set up and deploy? → **Yes**
   - Which scope? → Choose your account
   - Link to existing project? → **No** (first time) or **Yes** (if already exists)
   - What's your project's name? → **correspondence-clerk** (or your preferred name)
   - In which directory is your code located? → **./** (press Enter)
   - Want to override settings? → **No** (Vercel auto-detects Next.js)

3. **Deployment** - Vercel will:
   - Upload your code
   - Build the application
   - Deploy to production
   - Provide you with a live URL

**Expected Output:**
```
✓ Production: https://correspondence-clerk-xxx.vercel.app [copied to clipboard] [XX s]
```

### Step 2: Configure Environment Variables

After deployment, you need to add your environment variables:

**Option A: Via Vercel Dashboard (Recommended)**

1. Go to https://vercel.com/dashboard
2. Select your "correspondence-clerk" project
3. Go to **Settings** → **Environment Variables**
4. Add each variable from your `.env.local`:

**Required Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**Optional Variables (for Google Docs export):**
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

5. Select environments: **Production**, **Preview**, **Development**
6. Click **Save**

**Option B: Via CLI**

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Paste your value when prompted
# Repeat for each variable
```

### Step 3: Redeploy with Environment Variables

After adding environment variables, trigger a new deployment:

```bash
vercel --prod
```

Or in the Vercel Dashboard:
- Go to **Deployments**
- Click the three dots on the latest deployment
- Click **Redeploy**

### Step 4: Configure Supabase for Production

Update your Supabase project to allow the production URL:

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Add your Vercel URL to:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: `https://your-app.vercel.app/**`

---

## Alternative: Deploy via GitHub Integration

**For automated deployments on every push:**

1. Go to https://vercel.com/dashboard
2. Click **Add New** → **Project**
3. Import your GitHub repository: `tomapperley8-del/correspondence-clerk`
4. Configure settings (Vercel auto-detects Next.js)
5. Add environment variables
6. Click **Deploy**

**Benefits:**
- Automatic deployments on every git push
- Preview deployments for pull requests
- Easy rollback to previous versions

---

## Verifying Your Deployment

### 1. Check the Dashboard
Visit your Vercel URL: `https://your-app.vercel.app`

**Expected:**
- ✅ Login page loads
- ✅ Black navigation bar with olive green accents
- ✅ Proper styling (Chiswick Calendar colors)

### 2. Test Authentication
1. Log in with your credentials
2. Create a test business
3. File a test correspondence entry

### 3. Test New Features
- ✅ Dashboard pagination (if you have 13+ businesses)
- ✅ Help page at `/help`
- ✅ Search functionality
- ✅ Color scheme (black nav, olive green)

### 4. Check Console for Errors
Open browser DevTools (F12) and check for:
- No console errors
- API calls succeeding (200 status)
- Supabase connection working

---

## Common Issues & Solutions

### Issue: "Invalid Refresh Token" or Auth Errors

**Solution:**
- Update Supabase redirect URLs to include your Vercel domain
- Clear browser cookies and try again
- Verify environment variables are set correctly

### Issue: Build Fails on Vercel

**Solution:**
- Check the build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify TypeScript has no errors: `npm run build` locally

### Issue: Environment Variables Not Working

**Solution:**
- Verify they're added in Vercel dashboard
- Ensure correct naming (especially `NEXT_PUBLIC_` prefix)
- Redeploy after adding variables

### Issue: Database Connection Failed

**Solution:**
- Check Supabase URL and keys in environment variables
- Verify Supabase project is active (not paused)
- Check Supabase Row Level Security policies allow authenticated users

---

## Custom Domain (Optional)

### Adding Your Own Domain

1. In Vercel dashboard, go to **Settings** → **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `correspondence.yourdomain.com`)
4. Follow DNS configuration instructions:
   - Add A record or CNAME to your DNS provider
   - Wait for DNS propagation (up to 48 hours)

5. Update environment variables:
   ```
   NEXT_PUBLIC_APP_URL=https://correspondence.yourdomain.com
   ```

6. Update Supabase redirect URLs with new domain

---

## Monitoring & Maintenance

### Vercel Dashboard Features

**Analytics:**
- View page visits and performance
- Monitor Web Vitals (LCP, FID, CLS)

**Logs:**
- Real-time function logs
- Error tracking
- API request monitoring

**Deployments:**
- View deployment history
- Rollback to previous versions with one click
- Preview deployments for testing

### Setting Up Alerts

1. Go to **Settings** → **Notifications**
2. Enable:
   - Deployment notifications (email/Slack)
   - Error alerts
   - Performance degradation warnings

---

## Deployment Workflow

### For Future Updates

1. **Make changes locally**
   ```bash
   # Test locally
   npm run dev

   # Test build
   npm run build
   ```

2. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: your changes"
   git push origin master
   ```

3. **Deploy**

   **Option A: Automatic (with GitHub integration)**
   - Vercel automatically deploys on push

   **Option B: Manual**
   ```bash
   vercel --prod
   ```

4. **Verify deployment**
   - Check Vercel dashboard for build status
   - Visit production URL
   - Test changes

---

## Rollback Procedure

If something goes wrong:

1. Go to Vercel dashboard → **Deployments**
2. Find the last working deployment
3. Click the three dots → **Promote to Production**
4. Or revert git commit and redeploy:
   ```bash
   git revert HEAD
   git push origin master
   ```

---

## Security Checklist

Before going live:

- [ ] Environment variables set in Vercel (not in code)
- [ ] `.env.local` in `.gitignore` (never committed)
- [ ] Supabase RLS policies enabled
- [ ] Supabase redirect URLs configured
- [ ] CORS settings correct in Supabase
- [ ] API keys have appropriate permissions
- [ ] No sensitive data in client-side code

---

## Performance Optimization

Vercel automatically provides:
- ✅ Global CDN (fast worldwide)
- ✅ Automatic HTTPS
- ✅ Image optimization
- ✅ Edge caching
- ✅ Compression (gzip/brotli)

---

## Support & Resources

**Vercel Documentation:**
- https://vercel.com/docs
- https://vercel.com/docs/frameworks/nextjs

**Deployment Issues:**
- Check build logs in Vercel dashboard
- Review environment variables
- Test build locally first

**Supabase Configuration:**
- https://supabase.com/docs/guides/auth
- Check Authentication settings
- Verify database connection

---

## Success Indicators

Your deployment is successful when:

✅ Build completes without errors
✅ Production URL loads correctly
✅ Login/authentication works
✅ Dashboard displays businesses
✅ New features work (pagination, colors, help page)
✅ No console errors in browser
✅ Database operations succeed
✅ AI formatting works (if Anthropic key set)

---

## Next Steps After Deployment

1. **Test thoroughly** - Go through all major workflows
2. **Invite team members** - Add users to test multi-user features
3. **Import businesses** - Use the CSV import if you have existing data
4. **Monitor** - Watch Vercel dashboard for any issues
5. **Backup** - Supabase handles this, but verify settings
6. **Documentation** - Share the `/help` page with your team

---

**Deployment Status:** Ready to Deploy ✅

Run: `vercel --prod` to go live!
