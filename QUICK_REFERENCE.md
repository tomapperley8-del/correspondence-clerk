# Quick Reference Guide

**Last Updated:** January 20, 2026

---

## 🌐 Live URLs

- **Production Site:** https://correspondence-clerk.vercel.app
- **Dashboard:** https://correspondence-clerk.vercel.app/dashboard
- **Help Page:** https://correspondence-clerk.vercel.app/help
- **Vercel Dashboard:** https://vercel.com/dashboard
- **GitHub Repo:** https://github.com/tomapperley8-del/correspondence-clerk

---

## 📧 Outlook Integration

**Bookmarklet Installer:** https://correspondence-clerk.vercel.app/install-bookmarklet.html

One-click email filing from Outlook Web:
- Drag-and-drop installer page
- Works with Outlook.com and Office 365
- Pre-fills business and contact from email addresses
- See `OUTLOOK_INTEGRATION.md` for full documentation

**Quick Installation:**
1. Visit the installer page above
2. Drag the bookmarklet button to your bookmarks bar
3. Open any email in Outlook Web
4. Click the bookmark to file it in Correspondence Clerk

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `SESSION_STATE.md` | **Current state** - What was done, what's deployed, where we are |
| `docs/USER_GUIDE.md` | **User documentation** - Complete guide for end users (863 lines) |
| `docs/TESTING_CHECKLIST.md` | **Testing** - 153 test items for all features |
| `docs/IMPLEMENTATION_SUMMARY.md` | **Implementation details** - How the documentation system works |
| `docs/DASHBOARD_AND_COLOR_UPDATES.md` | **Recent changes** - Pagination and color scheme details |
| `CONTRIBUTING.md` | **Developer guide** - How to contribute and maintain |
| `DEPLOYMENT_GUIDE.md` | **Deployment** - How to deploy to Vercel |
| `UPDATE_EXISTING_DEPLOYMENT.md` | **Updates** - How to update existing deployment |
| `QUICK_REFERENCE.md` | **This file** - Quick links and commands |

---

## 🎨 Current Features (Production)

### Dashboard
- ✅ Pagination (12 items per page)
- ✅ First/Previous/Next/Last navigation
- ✅ Page number buttons (max 5 shown)
- ✅ Filter by type, category, search
- ✅ Sort by recent, oldest, name

### Color Scheme (Chiswick Calendar)
- ✅ Black navigation bar (#000000)
- ✅ White text (#ffffff)
- ✅ Olive green accents (#98bf64)
- ✅ Pipe separators between nav items
- ✅ Olive green focus rings

### Documentation
- ✅ In-app help page at `/help`
- ✅ Auto-updating sections
- ✅ Search within help
- ✅ Table of contents
- ✅ Mobile responsive

### Core Functionality
- ✅ User authentication
- ✅ Business management
- ✅ Contact management
- ✅ Correspondence filing
- ✅ Email thread splitting
- ✅ AI formatting
- ✅ Full-text search
- ✅ Google Docs export
- ✅ Organization/team management

---

## ⚡ Quick Commands

```bash
# Development
npm run dev                    # Start dev server (http://localhost:3000)
npm run build                  # Test production build

# Documentation
npm run update-docs            # Regenerate auto-sections in USER_GUIDE.md
npm run export-user-guide      # Prepare Google Docs export

# Deployment
git add .                      # Stage changes
git commit -m "your message"   # Commit changes
git push origin master         # Push to GitHub (auto-deploys to Vercel)
vercel --prod                  # Manual deployment (if needed)

# Verification
vercel --prod --yes            # Deploy with auto-confirmation
```

---

## 🔑 Environment Variables

**Required in Vercel Dashboard:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_APP_URL` (your Vercel URL)

**Optional (for Google Docs export):**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

---

## 📁 Key File Locations

### Code
- `app/dashboard/page.tsx` - Dashboard with pagination
- `app/help/page.tsx` - Help page (server component)
- `app/help/help-content.tsx` - Help page (client component)
- `components/Navigation.tsx` - Navigation bar
- `app/globals.css` - Global styles and color variables

### Scripts
- `lib/docs/auto-docs.ts` - Auto-documentation generator
- `scripts/update-docs.ts` - Update documentation script
- `scripts/export-user-guide-to-gdoc.ts` - Export script

### Documentation
- `docs/USER_GUIDE.md` - Main user guide
- `docs/TESTING_CHECKLIST.md` - Testing checklist
- `CONTRIBUTING.md` - Developer guidelines
- `SESSION_STATE.md` - Current project state

---

## 🎨 Color Palette

```css
/* Chiswick Calendar Colors */
--header-bg: #000000          /* Black navigation */
--nav-text: #ffffff           /* White text */
--link-hover: #98bf64         /* Olive green hover */

/* Section Accents */
--section-news-features: #98bf64   /* Olive green */
--section-chiswick-news: #e67e51   /* Coral */
--section-sidebar-btn: #eaff00     /* Yellow */

/* Backgrounds & Text */
--main-bg: #ffffff            /* White background */
--sidebar-bg: #f5f5f5         /* Light grey */
--body-text: #333333          /* Dark grey */
--italic-subtext: #777777     /* Medium grey */
--link-blue: #4a6fa5          /* Professional blue */
```

---

## 🔄 Common Workflows

### Making Changes
1. Make code changes locally
2. Test with `npm run dev`
3. Update docs with `npm run update-docs` (if needed)
4. Test build with `npm run build`
5. Commit: `git add . && git commit -m "message"`
6. Push: `git push origin master`
7. Vercel auto-deploys (1-2 minutes)

### Updating Documentation
1. Edit manual sections in `docs/USER_GUIDE.md`
2. Run `npm run update-docs` to regenerate auto-sections
3. Commit and push changes
4. Help page updates automatically

### Testing New Features
1. Check `docs/TESTING_CHECKLIST.md`
2. Test locally first
3. Test on production after deployment
4. Update checklist with results

---

## 🆘 Troubleshooting

### Build Fails
1. Check Vercel dashboard logs
2. Run `npm run build` locally
3. Fix any TypeScript errors
4. Push again

### Deployment Doesn't Update
1. Check Vercel dashboard - is it building?
2. Verify GitHub integration is active
3. Try manual deployment: `vercel --prod`

### Colors Look Wrong
1. Clear browser cache (Ctrl+Shift+R)
2. Check `app/globals.css` has correct variables
3. Verify Navigation.tsx uses correct classes

### Help Page Not Working
1. Check `/help` route exists
2. Verify `docs/USER_GUIDE.md` exists
3. Check console for errors (F12)

---

## 📞 Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs
- **Tailwind CSS:** https://tailwindcss.com/docs

---

## ✅ Current Status Summary

**Deployment:** ✅ Live in Production
**Features:** ✅ All Working
**Documentation:** ✅ Complete
**Testing:** ⏳ Checklist Ready (153 items)
**Next Steps:** Test in production, gather feedback

---

**Pro Tip:** Always check `SESSION_STATE.md` first - it has the most current information about what's been done and where things are!
