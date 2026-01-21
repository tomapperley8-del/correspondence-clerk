import { Metadata } from 'next';
import fs from 'fs';
import path from 'path';
import { HelpContent } from './help-content';

export const metadata: Metadata = {
  title: 'Help | Correspondence Clerk',
  description: 'User guide and documentation for Correspondence Clerk',
};

export default function HelpPage() {
  // Read the USER_GUIDE.md file at build time
  const userGuidePath = path.join(process.cwd(), 'docs', 'USER_GUIDE.md');
  let markdownContent = '';

  try {
    markdownContent = fs.readFileSync(userGuidePath, 'utf-8');
  } catch (error) {
    console.error('Failed to read USER_GUIDE.md:', error);
    markdownContent = '# User Guide\n\nDocumentation is being updated. Please check back soon.';
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <HelpContent markdown={markdownContent} />
      </div>
    </div>
  );
}
