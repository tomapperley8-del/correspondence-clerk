# Contributing to Correspondence Clerk

Thank you for your interest in contributing to Correspondence Clerk! This document provides guidelines for developers working on the codebase.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Code Standards](#code-standards)
3. [Updating Documentation](#updating-documentation)
4. [Testing Guidelines](#testing-guidelines)
5. [Commit Message Guidelines](#commit-message-guidelines)
6. [Pull Request Process](#pull-request-process)

---

## Development Setup

### Prerequisites

- Node.js 20+ and npm
- Supabase account (for local development)
- Anthropic API key (for AI formatting features)
- Google Cloud account (for export features)

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/correspondence-clerk.git
   cd correspondence-clerk
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your credentials.

4. Run database migrations:
   ```bash
   npx supabase db push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open http://localhost:3000

---

## Code Standards

### TypeScript

- Use TypeScript for all new code
- Prefer interfaces over types for object shapes
- Avoid `any` - use `unknown` if truly dynamic
- Use strict mode (already configured)

### React Components

- Use functional components with hooks
- Prefer server components by default (add `'use client'` only when needed)
- Keep components focused and small
- Extract complex logic into custom hooks or utilities

### Styling

- Use Tailwind CSS classes
- Follow the design system: **no rounded corners, no shadows**
- Use semantic class names where appropriate
- Mobile-first responsive design

### File Structure

```
app/                  # Next.js App Router pages
components/           # Reusable UI components
lib/                  # Utilities and business logic
  ├── actions/        # Server actions
  ├── db/             # Database queries
  ├── ai/             # AI integration
  ├── export/         # Export functionality
  └── docs/           # Documentation generators
scripts/              # Build and maintenance scripts
docs/                 # User documentation
supabase/migrations/  # Database migrations
```

### Naming Conventions

- **Files**: `kebab-case.tsx`, `kebab-case.ts`
- **Components**: `PascalCase`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

---

## Updating Documentation

**IMPORTANT:** When you change features, you must update documentation. Follow these steps:

### Step 1: Update USER_GUIDE.md

If your changes affect user-facing features:

1. Open `docs/USER_GUIDE.md`
2. Find the relevant section
3. Update the **manual content** (not auto-generated sections)
4. Be clear, concise, and user-friendly (remember the audience is non-technical)

**Manual sections** (you edit directly):
- Getting Started
- Core Features (workflows and instructions)
- Common Questions (FAQ)
- Troubleshooting
- Glossary (manual definitions)

**Auto-generated sections** (don't edit directly):
- Database schema documentation
- Feature list
- Environment variables guide
- Hard rules explanation
- Action needed types

These sections are marked with:
```markdown
<!-- AUTO: section-name -->
...content...
<!-- /AUTO: section-name -->
```

### Step 2: Run Auto-Docs Generator

After updating manual content, regenerate auto-sections:

```bash
npm run update-docs
```

This command:
1. Reads the current codebase (migrations, pages, etc.)
2. Generates updated documentation snippets
3. Replaces content between `<!-- AUTO: ... -->` markers
4. Leaves manual sections untouched

**Always commit the updated USER_GUIDE.md** after running this command.

### Step 3: Update Testing Checklist

If you added or changed features:

1. Open `docs/TESTING_CHECKLIST.md`
2. Add new test items in the relevant section
3. Mark items as tested or pending
4. Document any issues found

### Step 4: Export User Guide to Google Docs (Optional)

To update the shared Google Doc:

```bash
npm run export-user-guide
```

This prepares the export. You can complete it in Claude Code with MCP enabled.

### Step 5: Update ARCHITECTURE.md (If Needed)

For technical changes to:
- Database schema
- API contracts
- Module structure
- Security policies

Update `ARCHITECTURE.md` to reflect the changes.

---

## Testing Guidelines

### Manual Testing

Before submitting a PR:

1. Test your changes manually
2. Update `docs/TESTING_CHECKLIST.md` with results
3. Test on multiple screen sizes (mobile, tablet, desktop)
4. Test with slow network (simulate in browser DevTools)

### Automated Testing (Future)

When test infrastructure is added:

```bash
npm test
```

### Critical Path Testing

Always manually test these workflows before submitting:

- [ ] Login and authentication
- [ ] Create new correspondence entry
- [ ] Select business and contact
- [ ] Search for past correspondence
- [ ] Export to Google Docs

---

## Commit Message Guidelines

Use conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring (no feature change)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(new-entry): add duplicate detection modal

Implements duplicate entry warning when user tries to save
correspondence that looks similar to recently filed entry.

Closes #42
```

```
docs(user-guide): update search section with new filters

Added documentation for the new category and status filters
on the search page.
```

```
fix(export): handle businesses with 100+ entries

Export was timing out for large businesses. Now uses
batching and progress indicator.

Fixes #89
```

---

## Pull Request Process

### Before Submitting

1. **Update documentation** (see [Updating Documentation](#updating-documentation))
2. **Run the auto-docs generator**:
   ```bash
   npm run update-docs
   ```
3. **Test your changes** (see [Testing Guidelines](#testing-guidelines))
4. **Update TESTING_CHECKLIST.md** with your test results
5. **Ensure no console errors or warnings**
6. **Check that the app builds**:
   ```bash
   npm run build
   ```

### PR Template

When opening a PR, include:

**Summary:**
Brief description of what changed and why.

**Changes:**
- Bullet list of specific changes
- Link to related issues

**Testing:**
- How you tested the changes
- Which items in TESTING_CHECKLIST.md you verified

**Documentation:**
- [ ] Updated USER_GUIDE.md (if user-facing changes)
- [ ] Ran `npm run update-docs`
- [ ] Updated TESTING_CHECKLIST.md
- [ ] Updated ARCHITECTURE.md (if technical changes)

**Screenshots:**
Include before/after screenshots for UI changes.

### Code Review

PRs require:
- At least one approval
- All checks passing
- Documentation updated
- No merge conflicts

### Merging

- Use "Squash and merge" for clean history
- Ensure commit message follows conventional commits
- Delete branch after merge

---

## Documentation Maintenance

### When to Update Docs

**Always update docs when you:**
- Add a new page or feature
- Change existing workflows
- Modify database schema
- Change API contracts
- Add or remove environment variables

**Run `npm run update-docs` when you:**
- Add/remove app pages
- Change database migrations
- Modify `.env.example`
- Change hard rules in CLAUDE.md

### Auto-Generated Content

The `lib/docs/auto-docs.ts` module generates:

1. **Database schema documentation** - from `supabase/migrations/*.sql`
2. **Feature list** - from `app/**/page.tsx` files
3. **Environment variables guide** - from `.env.example`
4. **Hard rules explanation** - from `CLAUDE.md`
5. **Action needed types** - from type definitions

**To modify auto-generated content:**
1. Update the source (migrations, pages, .env.example, etc.)
2. Run `npm run update-docs`
3. Commit the regenerated USER_GUIDE.md

**Do not edit auto-generated sections directly** - your changes will be overwritten.

### Keeping Docs in Sync

**CI/CD Integration (Future):**

When CI is set up, it will:
1. Run `npm run update-docs` on every PR
2. Fail if auto-sections are stale
3. Auto-commit updated docs

Until then, manually run `npm run update-docs` before committing.

---

## Debugging Tips

### Common Issues

**"AI formatting failed"**
- Check your `ANTHROPIC_API_KEY` in `.env.local`
- Ensure API key has quota remaining
- Check network connectivity

**"Supabase connection error"**
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Check Supabase project status
- Ensure RLS policies are enabled

**"Google Docs export failed"**
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Check Google Cloud Console for API quotas
- Ensure Google Docs API is enabled

### Useful Commands

**View database logs:**
```bash
npx supabase logs
```

**Reset database:**
```bash
npx supabase db reset
```

**Generate TypeScript types from database:**
```bash
npx supabase gen types typescript --local > lib/database.types.ts
```

---

## Questions?

- Check `docs/USER_GUIDE.md` for user-facing documentation
- Check `ARCHITECTURE.md` for technical architecture
- Check `CLAUDE.md` for product requirements and hard rules
- Open an issue for bugs or feature requests
- Reach out to maintainers for complex questions

---

## Code of Conduct

Be respectful, constructive, and collaborative. We're all here to build something useful.

---

**Happy contributing!**

