import { describe, it, expect } from 'vitest'
import { parseWithRecovery } from '@/lib/ai/json-recovery'

describe('JSON Recovery', () => {
  describe('parseWithRecovery', () => {
    describe('Valid JSON inputs', () => {
      it('should parse valid JSON without wrapper', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Hello world"}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.subject_guess).toBe('Test')
          expect(result.data.formatted_text).toBe('Hello world')
        }
      })

      it('should parse JSON with markdown code block wrapper', () => {
        const input = '```json\n{"subject_guess": "Test", "formatted_text": "Hello"}\n```'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.subject_guess).toBe('Test')
        }
      })

      it('should parse JSON with triple-quote wrapper', () => {
        const input = '"""json\n{"subject_guess": "Test", "formatted_text": "Hello"}\n"""'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
      })

      it('should parse JSON with leading prose', () => {
        const input = 'Here is the formatted response:\n\n{"subject_guess": "Test", "formatted_text": "Hello"}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
      })

      it('should parse JSON with trailing prose', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Hello"}\n\nI hope this helps!'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
      })

      it('should parse complex nested JSON', () => {
        const input = `\`\`\`json
{
  "entries": [
    {"subject_guess": "Test 1", "formatted_text": "First"},
    {"subject_guess": "Test 2", "formatted_text": "Second"}
  ],
  "warnings": []
}
\`\`\``
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.entries).toHaveLength(2)
        }
      })

      it('should handle JSON with escaped newlines', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Line 1\\nLine 2\\nLine 3"}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.formatted_text).toBe('Line 1\nLine 2\nLine 3')
        }
      })

      it('should parse thread split response correctly', () => {
        const input = `{
  "entries": [
    {
      "subject_guess": "Re: Meeting",
      "entry_type_guess": "Email",
      "entry_date_guess": "2024-01-15T10:30:00Z",
      "formatted_text": "Thanks for confirming.",
      "warnings": []
    },
    {
      "subject_guess": "Re: Meeting",
      "entry_type_guess": "Email",
      "entry_date_guess": "2024-01-14T15:20:00Z",
      "formatted_text": "See you then!",
      "warnings": []
    }
  ],
  "warnings": []
}`
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.entries).toBeDefined()
          expect(result.data.entries).toHaveLength(2)
          expect(result.data.warnings).toEqual([])
        }
      })
    })

    describe('Invalid JSON inputs', () => {
      it('should fail gracefully on empty input', () => {
        const result = parseWithRecovery('')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toBeDefined()
        }
      })

      it('should fail gracefully on unterminated string', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Hello without closing quote}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(false)
      })

      it('should fail gracefully on missing closing brace', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Hello"'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(false)
      })

      it('should fail gracefully on trailing comma', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Hello", }'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(false)
      })

      it('should fail gracefully on plain text', () => {
        const input = 'This is just plain text without any JSON'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(false)
      })

      it('should fail gracefully on truncated JSON', () => {
        const input = '{"subject_guess": "Test", "entries": [{"subject_guess":'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(false)
      })
    })

    describe('Edge cases', () => {
      it('should handle JSON with unicode characters', () => {
        const input = '{"subject_guess": "Meeting with Müller", "formatted_text": "Café discussion about 日本"}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.subject_guess).toBe('Meeting with Müller')
        }
      })

      it('should handle JSON with special characters in values', () => {
        const input = '{"subject_guess": "Price: $100 & €80", "formatted_text": "Test <script>alert(1)</script>"}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
      })

      it('should handle deeply nested JSON', () => {
        const input = JSON.stringify({
          entries: [
            {
              subject_guess: 'Test',
              formatted_text: 'Content',
              warnings: ['Warning 1', 'Warning 2'],
              extracted_names: {
                sender: 'John',
                recipient: 'Jane',
              },
            },
          ],
          warnings: [],
        })

        const result = parseWithRecovery(input)
        expect(result.success).toBe(true)
      })

      it('should handle JSON with null values', () => {
        const input = '{"subject_guess": "Test", "entry_date_guess": null, "formatted_text": "Content"}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.entry_date_guess).toBeNull()
        }
      })

      it('should handle JSON with boolean values', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Content", "is_valid": true}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
      })

      it('should handle JSON with numeric values', () => {
        const input = '{"subject_guess": "Test", "formatted_text": "Content", "count": 42}'
        const result = parseWithRecovery(input)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.count).toBe(42)
        }
      })

      it('should handle whitespace-only input', () => {
        const result = parseWithRecovery('   \n\t  ')

        expect(result.success).toBe(false)
      })

      it('should handle mixed content - may or may not parse depending on implementation', () => {
        const input = `
Here is some text before.

\`\`\`json
{"subject_guess": "First Match", "formatted_text": "Content"}
\`\`\`

And here is more text.

{"subject_guess": "Second Match", "formatted_text": "Other content"}
`
        const result = parseWithRecovery(input)

        // Result depends on implementation - just ensure it doesn't crash
        expect(typeof result.success).toBe('boolean')
      })
    })
  })
})
