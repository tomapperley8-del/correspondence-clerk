import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type AuditAction =
  | 'import_mastersheet'
  | 'import_google_docs'
  | 'delete_business'
  | 'delete_contact'
  | 'delete_correspondence'

export type AuditStatus = 'success' | 'failure' | 'partial'

interface AuditLogEntry {
  action: AuditAction
  status: AuditStatus
  metadata?: Record<string, unknown>
}

/**
 * Log an admin action for audit purposes
 * Silently fails if logging fails - doesn't block the main operation
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.warn('Audit log: No user found')
      return
    }

    const organizationId = await getCurrentUserOrganizationId()

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        action: entry.action,
        status: entry.status,
        metadata: entry.metadata || {},
      })

    if (error) {
      console.error('Audit log insert error:', error)
    }
  } catch (error) {
    console.error('Audit log error:', error)
    // Don't throw - audit logging should never block the main operation
  }
}

/**
 * Helper to create audit metadata for import operations
 */
export function createImportMetadata(report: {
  businessesCreated?: number
  businessesUpdated?: number
  businessesMerged?: number
  contactsCreated?: number
  correspondenceCreated?: number
  documentsProcessed?: number
  businessesMatched?: number
  errors?: string[]
  warnings?: string[]
}): Record<string, unknown> {
  return {
    businesses_created: report.businessesCreated ?? 0,
    businesses_updated: report.businessesUpdated ?? 0,
    businesses_merged: report.businessesMerged ?? 0,
    contacts_created: report.contactsCreated ?? 0,
    correspondence_created: report.correspondenceCreated ?? 0,
    documents_processed: report.documentsProcessed ?? 0,
    businesses_matched: report.businessesMatched ?? 0,
    error_count: report.errors?.length ?? 0,
    warning_count: report.warnings?.length ?? 0,
    timestamp: new Date().toISOString(),
  }
}
