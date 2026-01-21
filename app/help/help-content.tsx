'use client';

import { useState, useEffect, useMemo } from 'react';

interface HelpContentProps {
  markdown: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

/**
 * Simple markdown to HTML converter
 * Handles the subset of markdown used in USER_GUIDE.md
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Remove HTML comments (auto-doc markers)
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Headers (must come before other replacements)
  html = html.replace(/^### (.*$)/gim, '<h3 id="$1">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 id="$1">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold and Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');

  // Paragraphs (split by double newlines)
  const paragraphs = html.split('\n\n');
  html = paragraphs
    .map((p) => {
      // Skip if already wrapped in HTML tags
      if (p.match(/^<[^>]+>/)) {
        return p;
      }
      // Skip empty paragraphs
      if (p.trim() === '') {
        return '';
      }
      return `<p>${p.trim()}</p>`;
    })
    .join('\n');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');

  return html;
}

/**
 * Extract table of contents from markdown
 */
function extractToc(markdown: string): TocItem[] {
  const tocItems: TocItem[] = [];
  const headerRegex = /^(#{1,3})\s+(.+)$/gm;
  let match;

  while ((match = headerRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^\w]+/g, '-');

    tocItems.push({ id, text, level });
  }

  return tocItems;
}

export function HelpContent({ markdown }: HelpContentProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('');

  const toc = useMemo(() => extractToc(markdown), [markdown]);
  const htmlContent = useMemo(() => markdownToHtml(markdown), [markdown]);

  // Filter content based on search
  const filteredHtml = useMemo(() => {
    if (!searchQuery.trim()) {
      return htmlContent;
    }

    // Simple search: highlight matching text
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    return htmlContent.replace(regex, '<mark>$1</mark>');
  }, [htmlContent, searchQuery]);

  // Scroll to section on TOC click
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const headings = document.querySelectorAll('h2[id], h3[id]');
      let current = '';

      headings.forEach((heading) => {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 100) {
          current = heading.id;
        }
      });

      setActiveSection(current);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
      {/* Sidebar: Table of Contents */}
      <aside className="lg:col-span-1">
        <div className="sticky top-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contents</h2>

          {/* Search within help docs */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Table of Contents */}
          <nav className="space-y-1">
            {toc.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`block w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  item.level === 1
                    ? 'font-semibold text-gray-900'
                    : item.level === 2
                    ? 'pl-4 text-gray-700'
                    : 'pl-6 text-gray-600'
                } ${
                  activeSection === item.id
                    ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-700'
                    : 'hover:bg-gray-50'
                }`}
              >
                {item.text}
              </button>
            ))}
          </nav>

          {/* Quick Links */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => scrollToSection('common-questions-faq')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Common Questions
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('troubleshooting')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Troubleshooting
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('glossary')}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Glossary
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <article className="lg:col-span-3">
        <div
          className="prose prose-slate max-w-none help-content"
          dangerouslySetInnerHTML={{ __html: filteredHtml }}
        />

        {/* Back to Top Button */}
        <div className="mt-12 text-center">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="px-6 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Back to Top
          </button>
        </div>
      </article>

      {/* Global Styles for Help Content */}
      <style jsx global>{`
        .help-content h1 {
          font-size: 2.5rem;
          font-weight: bold;
          margin-top: 2rem;
          margin-bottom: 1.5rem;
          color: #111827;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 0.5rem;
        }

        .help-content h2 {
          font-size: 2rem;
          font-weight: bold;
          margin-top: 3rem;
          margin-bottom: 1rem;
          color: #1f2937;
          scroll-margin-top: 6rem;
        }

        .help-content h3 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          color: #374151;
          scroll-margin-top: 6rem;
        }

        .help-content p {
          margin-bottom: 1rem;
          line-height: 1.7;
          color: #374151;
        }

        .help-content ul,
        .help-content ol {
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }

        .help-content li {
          margin-bottom: 0.5rem;
          line-height: 1.6;
        }

        .help-content ul {
          list-style-type: disc;
        }

        .help-content ol {
          list-style-type: decimal;
        }

        .help-content code {
          background-color: #f3f4f6;
          padding: 0.2rem 0.4rem;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
          color: #1f2937;
        }

        .help-content pre {
          background-color: #1f2937;
          color: #f9fafb;
          padding: 1rem;
          overflow-x: auto;
          margin-bottom: 1rem;
        }

        .help-content pre code {
          background-color: transparent;
          color: inherit;
          padding: 0;
        }

        .help-content a {
          color: #2563eb;
          text-decoration: underline;
        }

        .help-content a:hover {
          color: #1d4ed8;
        }

        .help-content hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 2rem 0;
        }

        .help-content mark {
          background-color: #fef08a;
          padding: 0.1rem 0.2rem;
        }

        .help-content strong {
          font-weight: 600;
          color: #111827;
        }

        .help-content em {
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
