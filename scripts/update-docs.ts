/**
 * Update USER_GUIDE.md with auto-generated content
 *
 * This script regenerates the auto-updating sections of the user guide
 * based on the current codebase.
 *
 * Usage: npm run update-docs
 */

import path from 'path';
import { updateUserGuideWithAutoDocs } from '../lib/docs/auto-docs';

async function main() {
  console.log('🔄 Updating USER_GUIDE.md with auto-generated content...\n');

  const userGuidePath = path.join(process.cwd(), 'docs', 'USER_GUIDE.md');

  try {
    updateUserGuideWithAutoDocs(userGuidePath);
    console.log('✅ USER_GUIDE.md updated successfully!');
    console.log('\n📝 Auto-generated sections:');
    console.log('  • Database schema documentation');
    console.log('  • Feature list');
    console.log('  • Environment variables guide');
    console.log('  • Hard rules explanation');
    console.log('  • Action needed types');
  } catch (error) {
    console.error('❌ Failed to update USER_GUIDE.md:', error);
    process.exit(1);
  }
}

main();
