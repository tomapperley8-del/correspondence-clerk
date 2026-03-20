/**
 * Setup Development Database
 *
 * Seeds the dev database with test organization and users.
 * Run with: npm run dev:setup
 *
 * Prerequisites:
 * - Create a new Supabase project for development
 * - Run all migrations against the dev project
 * - Copy .env.development.example to .env.local with dev credentials
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function setupDevDatabase() {
  console.log('Setting up development database...\n')

  // Check if test organization already exists
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('name', 'Test Organization')
    .single()

  if (existingOrg) {
    console.log('Test organization already exists:', existingOrg.name)
    console.log('Organization ID:', existingOrg.id)
    console.log('\nDevelopment database is ready!')
    return
  }

  // Create test organization
  console.log('Creating test organization...')
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: 'Test Organization',
    })
    .select()
    .single()

  if (orgError) {
    console.error('Failed to create organization:', orgError.message)
    process.exit(1)
  }

  console.log('Created organization:', org.name)
  console.log('Organization ID:', org.id)

  // Create test businesses
  console.log('\nCreating test businesses...')
  const businesses = [
    {
      organization_id: org.id,
      name: 'Acme Corp',
      category: 'Client',
      status: 'active',
    },
    {
      organization_id: org.id,
      name: 'TechStart Ltd',
      category: 'Prospect',
      status: 'active',
    },
    {
      organization_id: org.id,
      name: 'Old Client Inc',
      category: 'Former Client',
      status: 'inactive',
    },
  ]

  const { data: createdBusinesses, error: bizError } = await supabase
    .from('businesses')
    .insert(businesses)
    .select()

  if (bizError) {
    console.error('Failed to create businesses:', bizError.message)
  } else {
    console.log(`Created ${createdBusinesses?.length} test businesses`)
  }

  // Create test contacts for Acme Corp
  if (createdBusinesses && createdBusinesses.length > 0) {
    console.log('\nCreating test contacts...')
    const acmeBusiness = createdBusinesses[0]
    const contacts = [
      {
        organization_id: org.id,
        business_id: acmeBusiness.id,
        name: 'John Smith',
        role: 'Managing Director',
        emails: ['john@acme.com'],
        phones: ['020 1234 5678'],
      },
      {
        organization_id: org.id,
        business_id: acmeBusiness.id,
        name: 'Sarah Jones',
        role: 'Marketing Manager',
        emails: ['sarah@acme.com'],
        phones: [],
      },
    ]

    const { data: createdContacts, error: contactError } = await supabase
      .from('contacts')
      .insert(contacts)
      .select()

    if (contactError) {
      console.error('Failed to create contacts:', contactError.message)
    } else {
      console.log(`Created ${createdContacts?.length} test contacts`)
    }
  }

  console.log('\n=== Development Database Setup Complete ===')
  console.log('\nOrganization ID:', org.id)
  console.log('\nNext steps:')
  console.log('1. Create a test user via the signup page')
  console.log('2. Manually add the user to user_profiles with this organization_id')
  console.log('   Or use Supabase dashboard to update the profile')
}

setupDevDatabase().catch(console.error)
