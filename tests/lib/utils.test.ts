import { describe, it, expect } from 'vitest'
import { cn, formatDateGB, formatDateShortGB } from '@/lib/utils'

describe('Utils', () => {
  describe('cn (class name merger)', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2')
      expect(result).toBe('class1 class2')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const result = cn('base', isActive && 'active')
      expect(result).toBe('base active')
    })

    it('should filter out falsy values', () => {
      const result = cn('base', false, null, undefined, 'end')
      expect(result).toBe('base end')
    })

    it('should merge Tailwind classes correctly (override conflicts)', () => {
      const result = cn('p-4', 'p-2')
      expect(result).toBe('p-2')
    })

    it('should handle array of classes', () => {
      const result = cn(['class1', 'class2'], 'class3')
      expect(result).toBe('class1 class2 class3')
    })

    it('should handle object syntax', () => {
      const result = cn({
        'active': true,
        'disabled': false,
        'visible': true,
      })
      expect(result).toBe('active visible')
    })

    it('should handle empty input', () => {
      const result = cn()
      expect(result).toBe('')
    })
  })

  describe('formatDateGB (British date format)', () => {
    it('should format Date object to DD/MM/YYYY', () => {
      const date = new Date('2024-12-25')
      const result = formatDateGB(date)
      expect(result).toBe('25/12/2024')
    })

    it('should format ISO string to DD/MM/YYYY', () => {
      const result = formatDateGB('2024-01-15T10:30:00Z')
      expect(result).toBe('15/01/2024')
    })

    it('should handle single digit days and months', () => {
      const date = new Date('2024-01-05')
      const result = formatDateGB(date)
      expect(result).toBe('05/01/2024')
    })

    it('should format year 2000 correctly', () => {
      const date = new Date('2000-06-15')
      const result = formatDateGB(date)
      expect(result).toBe('15/06/2000')
    })

    it('should handle end of year', () => {
      const date = new Date('2024-12-31')
      const result = formatDateGB(date)
      expect(result).toBe('31/12/2024')
    })

    it('should handle start of year', () => {
      const date = new Date('2024-01-01')
      const result = formatDateGB(date)
      expect(result).toBe('01/01/2024')
    })
  })

  describe('formatDateShortGB (short British format)', () => {
    it('should format to "D Mon YYYY" format', () => {
      const date = new Date('2024-01-30')
      const result = formatDateShortGB(date)
      expect(result).toBe('30 Jan 2024')
    })

    it('should format ISO string correctly', () => {
      const result = formatDateShortGB('2024-12-25T00:00:00Z')
      expect(result).toBe('25 Dec 2024')
    })

    it('should show single digit day without leading zero', () => {
      const date = new Date('2024-06-05')
      const result = formatDateShortGB(date)
      expect(result).toBe('5 Jun 2024')
    })

    it('should handle all months correctly', () => {
      const months = [
        { month: '01', expected: 'Jan' },
        { month: '02', expected: 'Feb' },
        { month: '03', expected: 'Mar' },
        { month: '04', expected: 'Apr' },
        { month: '05', expected: 'May' },
        { month: '06', expected: 'Jun' },
        { month: '07', expected: 'Jul' },
        { month: '08', expected: 'Aug' },
        { month: '09', expected: 'Sep' },
        { month: '10', expected: 'Oct' },
        { month: '11', expected: 'Nov' },
        { month: '12', expected: 'Dec' },
      ]

      months.forEach(({ month, expected }) => {
        const date = new Date(`2024-${month}-15`)
        const result = formatDateShortGB(date)
        expect(result).toContain(expected)
      })
    })

    it('should handle leap year date', () => {
      const date = new Date('2024-02-29')
      const result = formatDateShortGB(date)
      expect(result).toBe('29 Feb 2024')
    })
  })
})
