/**
 * Tom, 4 Nov 2026: no auto-drafted emails. The routines (member_care, outreach) are disabled
 * on claude.ai and the app hides what they wrote. Nothing is deleted: routine_drafts,
 * draft_requests and the queues stay. Set AUTO_DRAFTS_ENABLED=true to show drafts again.
 */
export const AUTO_DRAFTS_ENABLED = process.env.AUTO_DRAFTS_ENABLED === 'true'
