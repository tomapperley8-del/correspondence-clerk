/**
 * Tests for JSON recovery system
 * Run with: npm test or node --loader tsx json-recovery.test.ts
 */

import { parseWithRecovery } from './json-recovery';

// Test utilities
function testParse(name: string, input: string, shouldSucceed: boolean) {
  console.log(`\n━━━ Test: ${name} ━━━`);
  const result = parseWithRecovery(input);

  if (result.success === shouldSucceed) {
    console.log(`✅ PASS: Expected ${shouldSucceed ? 'success' : 'failure'}`);
    if (result.success) {
      console.log('Parsed data:', JSON.stringify(result.data, null, 2));
    } else {
      console.log('Error message:', result.error);
    }
  } else {
    console.error(`❌ FAIL: Expected ${shouldSucceed ? 'success' : 'failure'}, got ${result.success ? 'success' : 'failure'}`);
  }

  return result;
}

console.log('Testing JSON Recovery System');
console.log('═══════════════════════════════════════════════\n');

// Test 1: Valid JSON with markdown wrapper
testParse(
  'Valid JSON with markdown wrapper',
  '```json\n{"subject_guess": "Test", "formatted_text": "Hello world"}\n```',
  true
);

// Test 2: Valid JSON without wrapper
testParse(
  'Valid JSON without wrapper',
  '{"subject_guess": "Test", "formatted_text": "Hello world"}',
  true
);

// Test 3: JSON with leading prose
testParse(
  'JSON with leading prose',
  'Here is the formatted response:\n\n{"subject_guess": "Test", "formatted_text": "Hello world"}',
  true
);

// Test 4: JSON with trailing prose
testParse(
  'JSON with trailing prose',
  '{"subject_guess": "Test", "formatted_text": "Hello world"}\n\nI hope this helps!',
  true
);

// Test 5: Unterminated string (should fail gracefully)
testParse(
  'Unterminated string error',
  '{"subject_guess": "Test", "formatted_text": "Hello\nworld without closing quote}',
  false
);

// Test 6: Missing closing brace (should fail gracefully)
testParse(
  'Missing closing brace',
  '{"subject_guess": "Test", "formatted_text": "Hello world"',
  false
);

// Test 7: Unexpected token (should fail gracefully)
testParse(
  'Unexpected token',
  '{"subject_guess": "Test", "formatted_text": "Hello world", }',
  false
);

// Test 8: Complex nested JSON with markdown wrapper
testParse(
  'Complex nested JSON',
  '```json\n{"entries": [{"subject_guess": "Test 1", "formatted_text": "First email"}, {"subject_guess": "Test 2", "formatted_text": "Second email"}]}\n```',
  true
);

// Test 9: JSON with escaped newlines (should succeed)
testParse(
  'JSON with escaped newlines',
  '{"subject_guess": "Test", "formatted_text": "Line 1\\nLine 2\\nLine 3"}',
  true
);

// Test 10: Empty response (should fail gracefully)
testParse(
  'Empty response',
  '',
  false
);

// Test 11: Triple-quote wrapper
testParse(
  'Triple-quote wrapper',
  '"""json\n{"subject_guess": "Test", "formatted_text": "Hello"}\n"""',
  true
);

// Test 12: Valid thread split response
testParse(
  'Thread split response',
  `\`\`\`json
{
  "entries": [
    {
      "subject_guess": "Re: Meeting tomorrow",
      "entry_type_guess": "Email",
      "entry_date_guess": "2024-01-15T10:30:00Z",
      "formatted_text": "Thanks for confirming.",
      "warnings": []
    },
    {
      "subject_guess": "Re: Meeting tomorrow",
      "entry_type_guess": "Email",
      "entry_date_guess": "2024-01-14T15:20:00Z",
      "formatted_text": "See you then!",
      "warnings": []
    }
  ],
  "warnings": []
}
\`\`\``,
  true
);

console.log('\n═══════════════════════════════════════════════');
console.log('Testing complete');
