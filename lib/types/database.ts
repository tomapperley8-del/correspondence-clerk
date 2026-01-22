export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          organization_id: string
          display_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          organization_id: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      businesses: {
        Row: {
          id: string
          name: string
          normalized_name: string
          category: string | null
          status: string | null
          is_club_card: boolean
          is_advertiser: boolean
          last_contacted_at: string | null
          mastersheet_source_ids: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          normalized_name: string
          category?: string | null
          status?: string | null
          is_club_card?: boolean
          is_advertiser?: boolean
          last_contacted_at?: string | null
          mastersheet_source_ids?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          normalized_name?: string
          category?: string | null
          status?: string | null
          is_club_card?: boolean
          is_advertiser?: boolean
          last_contacted_at?: string | null
          mastersheet_source_ids?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      contacts: {
        Row: {
          id: string
          business_id: string
          name: string
          email: string | null
          normalized_email: string | null
          role: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          email?: string | null
          normalized_email?: string | null
          role?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          email?: string | null
          normalized_email?: string | null
          role?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      correspondence: {
        Row: {
          id: string
          business_id: string
          contact_id: string
          user_id: string
          raw_text_original: string
          formatted_text_original: string | null
          formatted_text_current: string | null
          entry_date: string | null
          subject: string | null
          type: 'Email' | 'Call' | 'Meeting' | null
          action_needed:
            | 'none'
            | 'prospect'
            | 'follow_up'
            | 'waiting_on_them'
            | 'invoice'
            | 'renewal'
          due_at: string | null
          ai_metadata: Json | null
          created_at: string
          updated_at: string
          edited_at: string | null
          edited_by: string | null
        }
        Insert: {
          id?: string
          business_id: string
          contact_id: string
          user_id: string
          raw_text_original: string
          formatted_text_original?: string | null
          formatted_text_current?: string | null
          entry_date?: string | null
          subject?: string | null
          type?: 'Email' | 'Call' | 'Meeting' | null
          action_needed?:
            | 'none'
            | 'prospect'
            | 'follow_up'
            | 'waiting_on_them'
            | 'invoice'
            | 'renewal'
          due_at?: string | null
          ai_metadata?: Json | null
          created_at?: string
          updated_at?: string
          edited_at?: string | null
          edited_by?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          contact_id?: string
          user_id?: string
          raw_text_original?: string
          formatted_text_original?: string | null
          formatted_text_current?: string | null
          entry_date?: string | null
          subject?: string | null
          type?: 'Email' | 'Call' | 'Meeting' | null
          action_needed?:
            | 'none'
            | 'prospect'
            | 'follow_up'
            | 'waiting_on_them'
            | 'invoice'
            | 'renewal'
          due_at?: string | null
          ai_metadata?: Json | null
          created_at?: string
          updated_at?: string
          edited_at?: string | null
          edited_by?: string | null
        }
      }
    }
  }
}
