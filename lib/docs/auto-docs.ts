/**
 * Auto-Documentation Generator
 *
 * Generates documentation snippets from the codebase that stay in sync
 * with the actual implementation.
 */

import fs from 'fs';
import path from 'path';

/**
 * Generate user-friendly database schema documentation
 */
export function generateSchemaDocumentation(): string {
  return `### How Your Data is Stored

**Businesses**

Stores every company or organization you track. Each business has:
- **Name** and basic details
- **Category** - the type of business (e.g., Club Card, Advertiser)
- **Status flags** - Club Card (member) and Advertiser flags
- **Last contacted date** - automatically updated when you file correspondence
- **Contract information** - for members and advertisers

**Contacts**

The people at each business. Each contact has:
- **Name** (required - you must always name a real person)
- **Role or job title** - their position at the business
- **Email address** - primary contact email
- **Phone number** - contact phone
- **Linked to their business** - contacts always belong to a specific business

**Correspondence**

Your filed emails, calls, and meeting notes. Each entry stores:
- **Original text** (raw_text_original) - never changes, your safety net
- **Formatted text** (formatted_text_original) - AI-improved layout when first saved
- **Current text** (formatted_text_current) - the version shown, can be manually edited
- **Date, type, contact, business links** - all the metadata
- **Who saved it and when** - tracks which team member created the entry
- **Action needed status** - none, prospect, follow-up, waiting on them, invoice, renewal
- **Due date** - optional reminder date for follow-ups

**Organizations and Team Members**

How teams share data:
- **Organizations** - your company/team workspace
- **User Profiles** - each team member's account, linked to an organization
- **Invitations** - pending invites sent to team members
- **Shared visibility** - everyone in your organization sees all businesses and correspondence

**Data Safety**

Your data is protected through:
- **Original text preservation** - we never modify raw_text_original
- **Edit tracking** - every edit is timestamped and attributed
- **Foreign key constraints** - prevents orphaned data
- **Automatic backups** - Supabase handles daily backups
- **Row Level Security** - database enforces access permissions`;
}

/**
 * Generate feature list from app directory
 */
export function generateFeatureList(): string {
  const features = [
    { page: '/', title: 'Home Page', description: 'Landing page with login' },
    { page: '/dashboard', title: 'Dashboard', description: 'View all businesses at a glance, sorted by what needs doing' },
    { page: '/new-entry', title: 'New Entry', description: 'File new emails, calls, and meeting notes' },
    { page: '/businesses/[id]', title: 'Business Letter File', description: 'View chronological correspondence history per business' },
    { page: '/search', title: 'Search', description: 'Find past correspondence by business name or keyword' },
    { page: '/settings/organization', title: 'Organization Settings', description: 'Manage your team and organization settings' },
    { page: '/invite/accept', title: 'Accept Invitation', description: 'Join your team by accepting an invitation' },
    { page: '/admin/import', title: 'Import Businesses', description: 'Bulk import businesses from CSV (admin only)' },
    { page: '/admin/import-google-docs', title: 'Import from Google Docs', description: 'Import correspondence from existing Google Docs' },
  ];

  let output = '### Available Features\n\n';

  features.forEach(feature => {
    output += `**${feature.title}**\n`;
    output += `${feature.description}\n`;
    output += `Route: \`${feature.page}\`\n\n`;
  });

  return output;
}

/**
 * Generate environment variables documentation
 */
export function generateEnvDocumentation(): string {
  return `### Technical Configuration (For Administrators)

These settings are configured during initial setup:

**NEXT_PUBLIC_SUPABASE_URL**
Where your database is hosted. Set by your administrator during installation. This is the URL of your Supabase project.

**NEXT_PUBLIC_SUPABASE_ANON_KEY**
Public key for database access. Safe to expose in browser, as it's protected by Row Level Security policies.

**SUPABASE_SERVICE_ROLE_KEY**
Admin key for server-side operations. Never expose to the client. Used for operations that bypass RLS.

**ANTHROPIC_API_KEY**
Enables AI formatting. If this stops working, entries save as "unformatted" until fixed. You can still file correspondence without AI.

**NEXT_PUBLIC_APP_URL**
The web address where Correspondence Clerk is accessed (e.g., https://correspondence-clerk.vercel.app).

**GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET**
Required for Google Docs export feature. Get these from Google Cloud Console.

**What happens if a key stops working?**
- If Anthropic API fails: Correspondence saves as "unformatted" - you can format it later
- If Supabase fails: App won't load - contact your administrator
- If Google API fails: Export feature won't work, but filing correspondence continues normally`;
}

/**
 * Generate user-friendly explanation of hard rules from CLAUDE.md
 */
export function generateHardRulesExplanation(): string {
  return `### Why the App Works This Way

**You must always name a contact**
The app requires you to select (or create) a specific person for every entry. This ensures your letter file is always clear about who you spoke with. No "Unknown" or placeholder contacts allowed.

**Your original wording is never changed**
When AI formats your text, it only improves layout and spacing. Your actual words are preserved exactly as you wrote them in the \`raw_text_original\` field, which is never modified.

**Contact details are always visible**
When you select a contact, you can immediately see their role, email, and phone. If details are missing, you can add them inline without leaving the filing flow.

**AI failure never blocks you**
If the AI formatting service is unavailable, you can still save your correspondence. It's marked as "unformatted" and you can format it later when the service is back.

**Edits are corrections, not rewrites**
When you edit an entry, you're making manual corrections. The AI never rewrites your content. We preserve both the original formatted version and your edited version.

**No automatic suggestions**
This is a filing system, not a CRM. We don't suggest next steps, auto-follow-ups, or reminders you didn't create. We record what happened.

**Clear, labeled actions**
Every button and action is clearly labeled. No icon-only buttons that leave you guessing.

**Thread splitting is optional**
When you paste an email chain, we detect it and offer to split it into individual entries. But you always get to confirm before we do it.

**Full text search is fast**
We use PostgreSQL's full-text search with GIN indexes, so searching through thousands of entries is near-instant.

**Exports are print-ready**
Google Docs exports use proper formatting with page breaks, so you can print or share them immediately.`;
}

/**
 * Generate action needed types documentation
 */
export function generateActionNeededTypes(): string {
  return `### Action Needed Types

When filing correspondence, you can flag entries that need follow-up:

**none** - No action required, just for the record

**prospect** - New business opportunity, needs initial outreach

**follow_up** - Requires a response or continued conversation

**waiting_on_them** - Ball is in their court, waiting for their response

**invoice** - Need to send or follow up on an invoice

**renewal** - Contract or membership renewal coming up

These flags help the Dashboard sort businesses by what needs doing.`;
}

/**
 * Read and parse migration files to understand current schema
 */
function readMigrations(): string[] {
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

  try {
    const files = fs.readdirSync(migrationsDir);
    return files
      .filter(f => f.endsWith('.sql') && !f.includes('COMBINED'))
      .sort()
      .map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf-8'));
  } catch (error) {
    console.warn('Could not read migrations directory:', error);
    return [];
  }
}

/**
 * Generate full auto-documentation output
 */
export function generateAllAutoDocs(): {
  schema: string;
  features: string;
  env: string;
  hardRules: string;
  actionNeeded: string;
} {
  return {
    schema: generateSchemaDocumentation(),
    features: generateFeatureList(),
    env: generateEnvDocumentation(),
    hardRules: generateHardRulesExplanation(),
    actionNeeded: generateActionNeededTypes(),
  };
}

/**
 * Update USER_GUIDE.md with auto-generated sections
 */
export function updateUserGuideWithAutoDocs(userGuidePath: string): void {
  const autoDocs = generateAllAutoDocs();

  try {
    let content = fs.readFileSync(userGuidePath, 'utf-8');

    // Replace marked sections
    content = replaceBetweenMarkers(content, 'AUTO: database-schema', autoDocs.schema);
    content = replaceBetweenMarkers(content, 'AUTO: feature-list', autoDocs.features);
    content = replaceBetweenMarkers(content, 'AUTO: environment-variables', autoDocs.env);
    content = replaceBetweenMarkers(content, 'AUTO: hard-rules', autoDocs.hardRules);
    content = replaceBetweenMarkers(content, 'AUTO: action-needed-types', autoDocs.actionNeeded);

    fs.writeFileSync(userGuidePath, content, 'utf-8');
    console.log('✓ USER_GUIDE.md updated with auto-generated content');
  } catch (error) {
    console.error('Failed to update USER_GUIDE.md:', error);
    throw error;
  }
}

/**
 * Replace content between markers
 */
function replaceBetweenMarkers(content: string, marker: string, replacement: string): string {
  const startMarker = `<!-- ${marker} -->`;
  const endMarker = `<!-- /${marker} -->`;

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    console.warn(`Markers for ${marker} not found in document`);
    return content;
  }

  const before = content.substring(0, startIndex + startMarker.length);
  const after = content.substring(endIndex);

  return `${before}\n\n${replacement}\n\n${after}`;
}
