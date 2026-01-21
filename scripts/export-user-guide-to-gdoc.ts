/**
 * Export USER_GUIDE.md to Google Docs
 *
 * This script reads the USER_GUIDE.md file and creates/updates
 * a Google Doc with the content formatted for easy reading.
 *
 * Usage: npx tsx scripts/export-user-guide-to-gdoc.ts
 */

import fs from 'fs';
import path from 'path';

// Note: This script is designed to work with MCP google-workspace tools
// When run in Claude Code, it will have access to MCP functions
// For standalone execution, you'll need to implement Google Docs API integration

interface ExportConfig {
  documentTitle: string;
  userGuidePath: string;
  addCoverPage: boolean;
}

const config: ExportConfig = {
  documentTitle: 'Correspondence Clerk User Guide',
  userGuidePath: path.join(process.cwd(), 'docs', 'USER_GUIDE.md'),
  addCoverPage: true,
};

/**
 * Read the USER_GUIDE.md file
 */
function readUserGuide(): string {
  try {
    return fs.readFileSync(config.userGuidePath, 'utf-8');
  } catch (error) {
    console.error('❌ Failed to read USER_GUIDE.md:', error);
    throw error;
  }
}

/**
 * Parse markdown into structured sections
 */
interface Section {
  level: number;
  title: string;
  content: string;
}

function parseMarkdown(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split('\n');

  let currentSection: Section | null = null;

  for (const line of lines) {
    // Check for headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }

      // Start new section
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      currentSection = { level, title, content: '' };
    } else if (currentSection) {
      // Add line to current section content
      currentSection.content += line + '\n';
    }
  }

  // Save last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Convert markdown formatting to plain text for Google Docs
 * (MCP tools will handle the styling)
 */
function markdownToPlainText(markdown: string): string {
  let text = markdown;

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove code blocks but keep content
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```\w*\n?/g, '').trim();
  });

  // Remove inline code backticks
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove bold/italic markers
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');

  // Convert links to plain text with URL
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Clean up list markers
  text = text.replace(/^\s*[-*]\s+/gm, '• ');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Remove horizontal rules
  text = text.replace(/^---$/gm, '');

  return text.trim();
}

/**
 * Export to Google Docs using MCP tools
 * This function demonstrates the export flow
 */
async function exportToGoogleDocs(): Promise<void> {
  console.log('📖 Reading USER_GUIDE.md...');
  const markdown = readUserGuide();

  console.log('📝 Parsing markdown...');
  const sections = parseMarkdown(markdown);

  console.log(`✓ Found ${sections.length} sections`);

  console.log('\n📊 Export Preview:');
  console.log('═'.repeat(60));

  // Show preview of what will be exported
  sections.slice(0, 5).forEach((section) => {
    const indent = '  '.repeat(section.level - 1);
    console.log(`${indent}${'#'.repeat(section.level)} ${section.title}`);
  });

  console.log(`... and ${sections.length - 5} more sections`);
  console.log('═'.repeat(60));

  // Instructions for manual export using MCP tools
  console.log('\n📄 To export to Google Docs:');
  console.log('1. Run this command in Claude Code (with MCP google-workspace enabled)');
  console.log('2. Or use the following MCP tool calls:');
  console.log('');
  console.log('   Step 1: Create document');
  console.log(`   mcp__google-workspace__createDocument({ title: "${config.documentTitle}" })`);
  console.log('');
  console.log('   Step 2: For each section, append formatted content');
  console.log('   mcp__google-workspace__appendToGoogleDoc({ documentId, textToAppend: ... })');
  console.log('');
  console.log('   Step 3: Apply formatting');
  console.log('   mcp__google-workspace__applyParagraphStyle({ documentId, target, style })');
  console.log('');

  // Generate export data for manual processing
  const exportData = {
    title: config.documentTitle,
    sections: sections.map((section) => ({
      level: section.level,
      title: section.title,
      content: markdownToPlainText(section.content),
    })),
    metadata: {
      exportedAt: new Date().toISOString(),
      sourceFile: config.userGuidePath,
      version: '1.0.0',
    },
  };

  // Save export data as JSON for reference
  const exportDataPath = path.join(process.cwd(), 'docs', 'user-guide-export.json');
  fs.writeFileSync(exportDataPath, JSON.stringify(exportData, null, 2), 'utf-8');
  console.log(`\n✓ Export data saved to: ${exportDataPath}`);

  console.log('\n✅ Export preparation complete!');
  console.log('💡 Use Claude Code with MCP to complete the Google Docs export.');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Correspondence Clerk User Guide Exporter\n');

  try {
    await exportToGoogleDocs();
  } catch (error) {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { exportToGoogleDocs, parseMarkdown, markdownToPlainText };
