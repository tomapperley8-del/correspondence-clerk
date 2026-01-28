/**
 * Contact Extraction from Word Documents
 * Parses contact information from pasted Word document text
 * Per CLAUDE.md: Never invent content, only extract what's explicitly present
 */

export interface ExtractedContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  rawText: string; // For reference
}

export interface ContactExtractionResult {
  contacts: ExtractedContact[];
  hasContactsSection: boolean;
  contactsSectionText: string | null;
}

/**
 * Extract contacts from pasted Word document text
 * Handles both "Contacts:" section and individual contact blocks
 *
 * @param text - The raw pasted text from a Word document
 * @returns ContactExtractionResult with extracted contacts
 */
export function extractContactsFromText(text: string): ContactExtractionResult {
  // Find contacts section (everything before first dotted separator or correspondence headers)
  // Look for section that starts with "Contacts:" or similar
  const contactsSectionMatch = text.match(
    /(?:^|\n)(?:Contacts?|People|Contact (?:Details|Information)):?\s*([\s\S]*?)(?:\.{20,}|(?:Email from|From:|Sent:|Subject:|Correspondence|Messages?))/i
  );

  if (!contactsSectionMatch) {
    // Try alternative: just take everything before first long dotted separator
    const beforeSeparatorMatch = text.match(/^([\s\S]*?)\.{20,}/);
    if (beforeSeparatorMatch) {
      const potentialContactsText = beforeSeparatorMatch[1];
      // Only treat as contacts section if it has email or phone patterns
      if (/@/.test(potentialContactsText) || /tel|phone|mobile/i.test(potentialContactsText)) {
        return extractContactsFromSection(potentialContactsText);
      }
    }
    return { contacts: [], hasContactsSection: false, contactsSectionText: null };
  }

  const contactsText = contactsSectionMatch[1];
  return extractContactsFromSection(contactsText);
}

/**
 * Extract contacts from a specific section of text
 */
function extractContactsFromSection(contactsText: string): ContactExtractionResult {
  const contacts: ExtractedContact[] = [];

  // First, split by long dotted lines to separate major sections
  const sections = contactsText.split(/\.{10,}/).filter(s => s.trim().length > 0);

  for (const section of sections) {
    // Within each section, split into individual contact blocks
    // Look for lines that start a new contact (Name - Role or Name (Role) pattern)
    const lines = section.split('\n');
    let currentBlock: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and section headers
      if (!line || /^(?:Contacts?|Current contact|Previous contacts?|New contacts|Brewery shop):?\s*[-–]?\s*$/i.test(line)) {
        if (currentBlock.length > 0) {
          const contact = parseContactBlock(currentBlock.join('\n'));
          if (contact.name || contact.email) {
            contacts.push(contact);
          }
          currentBlock = [];
        }
        continue;
      }

      // Skip company/office information lines (not individual contacts)
      if (/^(?:Head office|Office|Website|Asahi|Fuller'?s)\s*[-–:]/i.test(line)) {
        continue;
      }

      // Skip address lines
      if (/^\d+\s+\w+|,\s*\w+\s+\w+\d+\s+\w+|United Kingdom$/i.test(line)) {
        continue;
      }

      // Check if this line starts a new contact (Name pattern)
      // Pattern: Capitalized name followed by dash, hyphen, or parenthesis (indicating role)
      const startsNewContact = /^[A-Z][a-z]+(?:\s+[A-Z][a-z']+)+\s*[-–(]/.test(line);

      if (startsNewContact && currentBlock.length > 0) {
        // Save previous contact
        const contact = parseContactBlock(currentBlock.join('\n'));
        if (contact.name || contact.email) {
          contacts.push(contact);
        }
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }

    // Don't forget the last contact in the section
    if (currentBlock.length > 0) {
      const contact = parseContactBlock(currentBlock.join('\n'));
      if (contact.name || contact.email) {
        contacts.push(contact);
      }
    }
  }

  return {
    contacts,
    hasContactsSection: contacts.length > 0,
    contactsSectionText: contacts.length > 0 ? contactsText : null,
  };
}

/**
 * Parse individual contact block
 *
 * Expected formats:
 * - "John Smith - Marketing Director"
 * - "John Smith (Marketing Director)"
 * - "Name: John Smith\nRole: Marketing Director\nEmail: john@example.com"
 * - Multi-line with Tel: and Email: labels
 */
function parseContactBlock(block: string): ExtractedContact {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let name = '';
  let role: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  // Extract email (Email: label or email pattern)
  const emailMatch = block.match(/(?:Email[:\s-]+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) {
    email = emailMatch[1].trim().toLowerCase();
  }

  // Extract phone (Tel: or Phone: label followed by number)
  const phoneMatch = block.match(/(?:Tel|Phone|Mobile)[:\s-]+([^\n]+)/i);
  if (phoneMatch) {
    phone = phoneMatch[1].trim();
    // Remove "Email:" if it got caught in the phone capture
    if (phone.toLowerCase().includes('email:')) {
      phone = phone.replace(/email:.*/i, '').trim();
    }
  }

  // Extract name and role
  // Pattern 1: "Current contact - Name (Extra info)" or similar prefix
  const currentContactMatch = block.match(/(?:Current contact|Main contact)\s*[-–]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)(?:\s*\(([^)]+)\))?/i);
  if (currentContactMatch) {
    name = currentContactMatch[1].trim();
    if (currentContactMatch[2]) {
      // Don't use the parenthetical as role if it says "Took over from..." etc
      const parenthetical = currentContactMatch[2].trim();
      if (!/took over|replaced|previously/i.test(parenthetical)) {
        role = parenthetical;
      }
    }
  } else {
    // Pattern 2: "Name - Role" or "Name (Role)"
    const nameRoleMatch = block.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–]\s*([^(\n]+)/m);
    if (nameRoleMatch) {
      name = nameRoleMatch[1].trim();
      role = nameRoleMatch[2].trim();
    } else {
      // Pattern 3: "Name (Role)"
      const nameParenMatch = block.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\(([^)]+)\)/m);
      if (nameParenMatch) {
        name = nameParenMatch[1].trim();
        const parenthetical = nameParenMatch[2].trim();
        // Don't use the parenthetical as role if it says "Took over from..." etc
        if (!/took over|replaced|previously/i.test(parenthetical)) {
          role = parenthetical;
        }
      } else {
        // Pattern 4: First line is name, second line might be role
        const firstLine = lines[0];

        // Check if first line looks like a name (2+ capitalized words, no colons)
        const namePattern = /^([A-Z][a-z']+(?:\s+[A-Z][a-z']+)+)(?:\s*[-–]\s*)?(.*)$/;
        const firstLineMatch = firstLine.match(namePattern);

        if (firstLineMatch && !firstLine.includes(':')) {
          name = firstLineMatch[1].trim();

          // If there's text after the name on same line, it might be role
          const potentialRole = firstLineMatch[2].trim();
          if (potentialRole && !potentialRole.toLowerCase().startsWith('tel') && !potentialRole.toLowerCase().startsWith('email')) {
            role = potentialRole;
          } else if (lines.length > 1) {
            // Check next line for role
            const secondLine = lines[1];
            if (!secondLine.toLowerCase().startsWith('tel') &&
                !secondLine.toLowerCase().startsWith('email') &&
                !secondLine.toLowerCase().startsWith('phone') &&
                !secondLine.includes('@')) {
              role = secondLine;
            }
          }
        } else {
          // Last resort: look for "Name:" label
          const nameLabelMatch = block.match(/Name[:\s-]+([^\n]+)/i);
          if (nameLabelMatch) {
            name = nameLabelMatch[1].trim();
          }

          // Look for "Role:" or "Title:" label
          const roleLabelMatch = block.match(/(?:Role|Title|Position)[:\s-]+([^\n]+)/i);
          if (roleLabelMatch) {
            role = roleLabelMatch[1].trim();
          }
        }
      }
    }
  }

  // Clean up role - remove common prefixes/suffixes
  if (role) {
    role = role
      .replace(/^[-–()\s]+/, '')
      .replace(/[-–()\s]+$/, '')
      .replace(/^(?:Role|Title|Position)[:\s-]+/i, '')
      .trim();
  }

  return {
    name: name || '',
    email,
    phone,
    role,
    rawText: block.trim(),
  };
}

/**
 * Normalize contact name for comparison
 */
export function normalizeContactName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two contacts are likely the same person
 */
export function isSameContact(a: ExtractedContact, b: ExtractedContact): boolean {
  // If both have emails, compare emails
  if (a.email && b.email) {
    return a.email.toLowerCase() === b.email.toLowerCase();
  }

  // Otherwise compare normalized names
  const nameA = normalizeContactName(a.name);
  const nameB = normalizeContactName(b.name);

  return nameA === nameB;
}
