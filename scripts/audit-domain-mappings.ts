// Read-only audit of domain_mappings: every mapping whose domain doesn't fit its business's
// name, and every business holding 3 or more of those. Reads a JSON export of the mappings
// (one row per mapping: id, d = domain, b = business id, n = name, s = status, c = contacts
// at that business on the domain, be = business email on the domain, at = date learned), so
// it never touches the database itself.
//
//   npx tsx scripts/audit-domain-mappings.ts supabase/.local/dm/mappings.json > out.md

import { readFileSync } from 'node:fs'
import { domainBusinessNameScore, registrableDomain } from '@/lib/inbound/utils'

type Row = { id: string; d: string; b: string; n: string; s: string | null; m: boolean; at: string; c: number; be: boolean }

const rows: Row[] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const misfits = rows.filter((r) => domainBusinessNameScore(r.d, r.n) < 0.6)

const byBiz = new Map<string, Row[]>()
for (const r of misfits) byBiz.set(r.b, [...(byBiz.get(r.b) ?? []), r])

const evidence = (r: Row) =>
  [r.be ? 'business email' : '', r.c ? `${r.c} contact${r.c > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') || 'none'

console.log(`# Domain mappings that don't fit their business\n`)
console.log(`${rows.length} mappings, ${misfits.length} don't fit the name, on ${byBiz.size} businesses.\n`)
console.log(`"On file" says whether the business's own email or a contact there uses the domain. A contact`)
console.log(`can have been created by the same wrong match, so it doesn't prove the mapping right.\n`)

const many = [...byBiz.values()].filter((g) => g.length >= 3).sort((a, b) => b.length - a.length)
console.log(`## Businesses with 3 or more unrelated domains\n`)
for (const g of many) {
  console.log(`### ${g[0].n} (${g[0].s ?? 'no status'}), ${g.length}\n`)
  for (const r of g) console.log(`- ${r.d} (learned ${r.at}; on file: ${evidence(r)})`)
  console.log('')
}

console.log(`## All other mappings that don't fit\n`)
console.log(`| Business | Status | Domain | Learned | On file |`)
console.log(`|---|---|---|---|---|`)
for (const g of [...byBiz.values()].filter((g) => g.length < 3).sort((a, b) => a[0].n.localeCompare(b[0].n)))
  for (const r of g) console.log(`| ${r.n} | ${r.s ?? ''} | ${r.d} | ${r.at} | ${evidence(r)} |`)

const subdomains = rows.filter((r) => registrableDomain(r.d) !== r.d).length
console.log(`\n(${subdomains} mappings are on a subdomain; they are scored on the company part.)`)
