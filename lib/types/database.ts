export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          organization_id: string | null
          status: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_senders: {
        Row: {
          created_at: string | null
          email: string
          id: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_senders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          category: string | null
          contract_amount: number | null
          contract_currency: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          deal_terms: string | null
          email: string | null
          id: string
          is_advertiser: boolean
          is_club_card: boolean
          last_contacted_at: string | null
          mastersheet_source_ids: Json | null
          membership_type: string | null
          name: string
          normalized_name: string
          notes: string | null
          organization_id: string
          payment_structure: string | null
          phone: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contract_amount?: number | null
          contract_currency?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          deal_terms?: string | null
          email?: string | null
          id?: string
          is_advertiser?: boolean
          is_club_card?: boolean
          last_contacted_at?: string | null
          mastersheet_source_ids?: Json | null
          membership_type?: string | null
          name: string
          normalized_name: string
          notes?: string | null
          organization_id: string
          payment_structure?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contract_amount?: number | null
          contract_currency?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          deal_terms?: string | null
          email?: string | null
          id?: string
          is_advertiser?: boolean
          is_club_card?: boolean
          last_contacted_at?: string | null
          mastersheet_source_ids?: Json | null
          membership_type?: string | null
          name?: string
          normalized_name?: string
          notes?: string | null
          organization_id?: string
          payment_structure?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          emails: Json | null
          id: string
          is_active: boolean
          name: string
          normalized_email: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phones: Json | null
          role: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          emails?: Json | null
          id?: string
          is_active?: boolean
          name: string
          normalized_email?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          phones?: Json | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          emails?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          normalized_email?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phones?: Json | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          business_id: string
          contract_amount: number | null
          contract_currency: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          deal_terms: string | null
          id: string
          invoice_paid: boolean
          is_current: boolean
          membership_type: string | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          contract_amount?: number | null
          contract_currency?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          deal_terms?: string | null
          id?: string
          invoice_paid?: boolean
          is_current?: boolean
          membership_type?: string | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          contract_amount?: number | null
          contract_currency?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          deal_terms?: string | null
          id?: string
          invoice_paid?: boolean
          is_current?: boolean
          membership_type?: string | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          business_id: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence: {
        Row: {
          action_needed: Database["public"]["Enums"]["action_needed_type"]
          ai_metadata: Json | null
          bcc_contact_ids: string[] | null
          business_id: string
          cc_contact_ids: string[] | null
          contact_id: string | null
          content_hash: string | null
          created_at: string
          direction: string | null
          due_at: string | null
          edited_at: string | null
          edited_by: string | null
          entry_date: string | null
          formatted_text_current: string | null
          formatted_text_original: string | null
          formatting_status: string
          id: string
          internal_sender: string | null
          is_pinned: boolean
          organization_id: string
          raw_text_original: string
          search_vector: unknown
          subject: string | null
          thread_id: string | null
          thread_participants: string | null
          type: Database["public"]["Enums"]["entry_type"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_needed?: Database["public"]["Enums"]["action_needed_type"]
          ai_metadata?: Json | null
          bcc_contact_ids?: string[] | null
          business_id: string
          cc_contact_ids?: string[] | null
          contact_id?: string | null
          content_hash?: string | null
          created_at?: string
          direction?: string | null
          due_at?: string | null
          edited_at?: string | null
          edited_by?: string | null
          entry_date?: string | null
          formatted_text_current?: string | null
          formatted_text_original?: string | null
          formatting_status?: string
          id?: string
          internal_sender?: string | null
          is_pinned?: boolean
          organization_id: string
          raw_text_original: string
          search_vector?: unknown
          subject?: string | null
          thread_id?: string | null
          thread_participants?: string | null
          type?: Database["public"]["Enums"]["entry_type"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_needed?: Database["public"]["Enums"]["action_needed_type"]
          ai_metadata?: Json | null
          bcc_contact_ids?: string[] | null
          business_id?: string
          cc_contact_ids?: string[] | null
          contact_id?: string | null
          content_hash?: string | null
          created_at?: string
          direction?: string | null
          due_at?: string | null
          edited_at?: string | null
          edited_by?: string | null
          entry_date?: string | null
          formatted_text_current?: string | null
          formatted_text_original?: string | null
          formatting_status?: string
          id?: string
          internal_sender?: string | null
          is_pinned?: boolean
          organization_id?: string
          raw_text_original?: string
          search_vector?: unknown
          subject?: string | null
          thread_id?: string | null
          thread_participants?: string | null
          type?: Database["public"]["Enums"]["entry_type"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_mappings: {
        Row: {
          business_id: string
          created_at: string
          domain: string
          id: string
          org_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          domain: string
          id?: string
          org_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          domain?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_mappings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_dismissals: {
        Row: {
          business_id: string
          dismissed_at: string | null
          dismissed_by: string | null
          entry_id_1: string
          entry_id_2: string
          id: string
        }
        Insert: {
          business_id: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          entry_id_1: string
          entry_id_2: string
          id?: string
        }
        Update: {
          business_id?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          entry_id_1?: string
          entry_id_2?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_dismissals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_dismissals_entry_id_1_fkey"
            columns: ["entry_id_1"]
            isOneToOne: false
            referencedRelation: "correspondence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_dismissals_entry_id_2_fkey"
            columns: ["entry_id_2"]
            isOneToOne: false
            referencedRelation: "correspondence"
            referencedColumns: ["id"]
          },
        ]
      }
      import_queue: {
        Row: {
          correspondence_id: string
          created_at: string
          error: string | null
          id: string
          org_id: string
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          correspondence_id: string
          created_at?: string
          error?: string | null
          id?: string
          org_id: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          correspondence_id?: string
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_queue_correspondence_id_fkey"
            columns: ["correspondence_id"]
            isOneToOne: false
            referencedRelation: "correspondence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_queue: {
        Row: {
          body_preview: string | null
          body_text: string | null
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          id: string
          org_id: string
          raw_payload: Json
          received_at: string
          status: string
          subject: string | null
          to_emails: Json | null
        }
        Insert: {
          body_preview?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          from_email: string
          from_name?: string | null
          id?: string
          org_id: string
          raw_payload: Json
          received_at?: string
          status?: string
          subject?: string | null
          to_emails?: Json | null
        }
        Update: {
          body_preview?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          id?: string
          org_id?: string
          raw_payload?: Json
          received_at?: string
          status?: string
          subject?: string | null
          to_emails?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_cache: {
        Row: {
          business_id: string | null
          content: string
          generated_at: string
          id: string
          insight_type: string
          org_id: string
        }
        Insert: {
          business_id?: string | null
          content: string
          generated_at?: string
          id?: string
          insight_type: string
          org_id: string
        }
        Update: {
          business_id?: string | null
          content?: string
          generated_at?: string
          id?: string
          insight_type?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_cache_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_email: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_email?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_email?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_actions: {
        Row: {
          action_type: string
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          priority: string
          prospect_id: string | null
          skipped: boolean | null
          skipped_reason: string | null
          snoozed_until: string | null
          title: string
        }
        Insert: {
          action_type: string
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          priority: string
          prospect_id?: string | null
          skipped?: boolean | null
          skipped_reason?: string | null
          snoozed_until?: string | null
          title: string
        }
        Update: {
          action_type?: string
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          priority?: string
          prospect_id?: string | null
          skipped?: boolean | null
          skipped_reason?: string | null
          snoozed_until?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "oe_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "oe_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_business_links: {
        Row: {
          cc_business_id: string
          confidence: number | null
          id: string
          link_source: string
          linked_at: string | null
          oe_prospect_id: string
        }
        Insert: {
          cc_business_id: string
          confidence?: number | null
          id?: string
          link_source?: string
          linked_at?: string | null
          oe_prospect_id: string
        }
        Update: {
          cc_business_id?: string
          confidence?: number | null
          id?: string
          link_source?: string
          linked_at?: string | null
          oe_prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oe_business_links_oe_prospect_id_fkey"
            columns: ["oe_prospect_id"]
            isOneToOne: false
            referencedRelation: "oe_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_business_types: {
        Row: {
          base_propensity_score: number | null
          category: string | null
          footfall_dependency: number | null
          grade: string | null
          id: string
          name: string
          pitch_notes: string | null
          sic_codes: string[] | null
          typical_budget_range: string | null
        }
        Insert: {
          base_propensity_score?: number | null
          category?: string | null
          footfall_dependency?: number | null
          grade?: string | null
          id: string
          name: string
          pitch_notes?: string | null
          sic_codes?: string[] | null
          typical_budget_range?: string | null
        }
        Update: {
          base_propensity_score?: number | null
          category?: string | null
          footfall_dependency?: number | null
          grade?: string | null
          id?: string
          name?: string
          pitch_notes?: string | null
          sic_codes?: string[] | null
          typical_budget_range?: string | null
        }
        Relationships: []
      }
      oe_competitor_ads: {
        Row: {
          ad_details: Json | null
          ad_url: string | null
          business_name: string
          created_at: string | null
          detection_method: string | null
          discovered_at: string | null
          id: string
          last_checked: string | null
          platform: string
          prospect_id: string | null
          publication: string | null
          still_active: boolean | null
        }
        Insert: {
          ad_details?: Json | null
          ad_url?: string | null
          business_name: string
          created_at?: string | null
          detection_method?: string | null
          discovered_at?: string | null
          id?: string
          last_checked?: string | null
          platform: string
          prospect_id?: string | null
          publication?: string | null
          still_active?: boolean | null
        }
        Update: {
          ad_details?: Json | null
          ad_url?: string | null
          business_name?: string
          created_at?: string | null
          detection_method?: string | null
          discovered_at?: string | null
          id?: string
          last_checked?: string | null
          platform?: string
          prospect_id?: string | null
          publication?: string | null
          still_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "oe_competitor_ads_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "oe_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_conversion_stats: {
        Row: {
          avg_days_to_convert: number | null
          dimension: string
          dimension_value: string
          id: string
          last_updated: string | null
          total_contacted: number | null
          total_conversions: number | null
          total_replies: number | null
        }
        Insert: {
          avg_days_to_convert?: number | null
          dimension: string
          dimension_value: string
          id: string
          last_updated?: string | null
          total_contacted?: number | null
          total_conversions?: number | null
          total_replies?: number | null
        }
        Update: {
          avg_days_to_convert?: number | null
          dimension?: string
          dimension_value?: string
          id?: string
          last_updated?: string | null
          total_contacted?: number | null
          total_conversions?: number | null
          total_replies?: number | null
        }
        Relationships: []
      }
      oe_digital_profiles: {
        Row: {
          ad_tech: Json | null
          analytics: Json | null
          booking_platforms: Json | null
          content_signals: Json | null
          created_at: string | null
          crm_tools: Json | null
          directories: Json | null
          directory_scanned_at: string | null
          ecommerce: Json | null
          email_marketing: Json | null
          has_cookie_consent: boolean | null
          id: string
          prospect_id: string
          retargeting: Json | null
          review_sites: Json | null
          review_widgets: Json | null
          scan_error: string | null
          social_activity: Json | null
          social_links: Json | null
          updated_at: string | null
          website_scanned_at: string | null
        }
        Insert: {
          ad_tech?: Json | null
          analytics?: Json | null
          booking_platforms?: Json | null
          content_signals?: Json | null
          created_at?: string | null
          crm_tools?: Json | null
          directories?: Json | null
          directory_scanned_at?: string | null
          ecommerce?: Json | null
          email_marketing?: Json | null
          has_cookie_consent?: boolean | null
          id?: string
          prospect_id: string
          retargeting?: Json | null
          review_sites?: Json | null
          review_widgets?: Json | null
          scan_error?: string | null
          social_activity?: Json | null
          social_links?: Json | null
          updated_at?: string | null
          website_scanned_at?: string | null
        }
        Update: {
          ad_tech?: Json | null
          analytics?: Json | null
          booking_platforms?: Json | null
          content_signals?: Json | null
          created_at?: string | null
          crm_tools?: Json | null
          directories?: Json | null
          directory_scanned_at?: string | null
          ecommerce?: Json | null
          email_marketing?: Json | null
          has_cookie_consent?: boolean | null
          id?: string
          prospect_id?: string
          retargeting?: Json | null
          review_sites?: Json | null
          review_widgets?: Json | null
          scan_error?: string | null
          social_activity?: Json | null
          social_links?: Json | null
          updated_at?: string | null
          website_scanned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oe_digital_profiles_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "oe_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_discovery_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duplicates: number | null
          errors: string[] | null
          id: string
          new_prospects: number | null
          postcodes: string[] | null
          source: string
          total_found: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duplicates?: number | null
          errors?: string[] | null
          id?: string
          new_prospects?: number | null
          postcodes?: string[] | null
          source: string
          total_found?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duplicates?: number | null
          errors?: string[] | null
          id?: string
          new_prospects?: number | null
          postcodes?: string[] | null
          source?: string
          total_found?: number | null
        }
        Relationships: []
      }
      oe_mastersheet_cache: {
        Row: {
          address: string | null
          business_name: string
          contact_name: string | null
          email: string | null
          id: string
          last_contact_date: string | null
          notes: string | null
          outreach_status: string | null
          phone: string | null
          raw_data: Json | null
          relationship_type: string | null
          row_number: number
          synced_at: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          contact_name?: string | null
          email?: string | null
          id?: string
          last_contact_date?: string | null
          notes?: string | null
          outreach_status?: string | null
          phone?: string | null
          raw_data?: Json | null
          relationship_type?: string | null
          row_number: number
          synced_at?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          contact_name?: string | null
          email?: string | null
          id?: string
          last_contact_date?: string | null
          notes?: string | null
          outreach_status?: string | null
          phone?: string | null
          raw_data?: Json | null
          relationship_type?: string | null
          row_number?: number
          synced_at?: string | null
        }
        Relationships: []
      }
      oe_outreach_events: {
        Row: {
          ai_score_at_time: number | null
          created_at: string | null
          event_type: string
          id: string
          notes: string | null
          product: string | null
          prospect_id: string | null
          skip_reason: string | null
        }
        Insert: {
          ai_score_at_time?: number | null
          created_at?: string | null
          event_type: string
          id?: string
          notes?: string | null
          product?: string | null
          prospect_id?: string | null
          skip_reason?: string | null
        }
        Update: {
          ai_score_at_time?: number | null
          created_at?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          product?: string | null
          prospect_id?: string | null
          skip_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oe_outreach_events_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "oe_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_pending_matches: {
        Row: {
          cc_business_id: string
          cc_name: string
          confidence: number
          created_at: string | null
          id: string
          oe_name: string
          oe_prospect_id: string
          reviewed: boolean | null
        }
        Insert: {
          cc_business_id: string
          cc_name: string
          confidence: number
          created_at?: string | null
          id?: string
          oe_name: string
          oe_prospect_id: string
          reviewed?: boolean | null
        }
        Update: {
          cc_business_id?: string
          cc_name?: string
          confidence?: number
          created_at?: string | null
          id?: string
          oe_name?: string
          oe_prospect_id?: string
          reviewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "oe_pending_matches_oe_prospect_id_fkey"
            columns: ["oe_prospect_id"]
            isOneToOne: false
            referencedRelation: "oe_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      oe_prospects: {
        Row: {
          address: string | null
          ai_score: number | null
          ai_score_reasoning: string | null
          ai_scored_at: string | null
          brief_generated_at: string | null
          business_type_id: string | null
          category: string | null
          company_number: string | null
          contact_brief: string | null
          contact_headline: string | null
          created_at: string | null
          email: string | null
          google_place_id: string | null
          google_rating: number | null
          google_review_count: number | null
          id: string
          incorporated_date: string | null
          last_ad_scanned_at: string | null
          last_contacted: string | null
          marketing_score: number | null
          mastersheet_row_id: string | null
          name: string
          next_action_date: string | null
          notes: string | null
          phone: string | null
          postcode: string | null
          propensity_score: number | null
          rating: number | null
          recommended_product: string | null
          relationship_type: string | null
          sic_codes: string[] | null
          social_urls: Json | null
          source: string
          source_id: string | null
          status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          ai_score?: number | null
          ai_score_reasoning?: string | null
          ai_scored_at?: string | null
          brief_generated_at?: string | null
          business_type_id?: string | null
          category?: string | null
          company_number?: string | null
          contact_brief?: string | null
          contact_headline?: string | null
          created_at?: string | null
          email?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          id?: string
          incorporated_date?: string | null
          last_ad_scanned_at?: string | null
          last_contacted?: string | null
          marketing_score?: number | null
          mastersheet_row_id?: string | null
          name: string
          next_action_date?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          propensity_score?: number | null
          rating?: number | null
          recommended_product?: string | null
          relationship_type?: string | null
          sic_codes?: string[] | null
          social_urls?: Json | null
          source: string
          source_id?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          ai_score?: number | null
          ai_score_reasoning?: string | null
          ai_scored_at?: string | null
          brief_generated_at?: string | null
          business_type_id?: string | null
          category?: string | null
          company_number?: string | null
          contact_brief?: string | null
          contact_headline?: string | null
          created_at?: string | null
          email?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          id?: string
          incorporated_date?: string | null
          last_ad_scanned_at?: string | null
          last_contacted?: string | null
          marketing_score?: number | null
          mastersheet_row_id?: string | null
          name?: string
          next_action_date?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          propensity_score?: number | null
          rating?: number | null
          recommended_product?: string | null
          relationship_type?: string | null
          sic_codes?: string[] | null
          social_urls?: Json | null
          source?: string
          source_id?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oe_prospects_business_type_id_fkey"
            columns: ["business_type_id"]
            isOneToOne: false
            referencedRelation: "oe_business_types"
            referencedColumns: ["id"]
          },
        ]
      }
      org_membership_types: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          label: string
          org_id: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          org_id: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          org_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_membership_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          business_description: string | null
          created_at: string
          created_by: string | null
          email_writing_style: string | null
          id: string
          ideal_customer_profile: string | null
          industry: string | null
          name: string
          services_offered: string | null
          typical_deal_value: string | null
          updated_at: string
          value_proposition: string | null
        }
        Insert: {
          business_description?: string | null
          created_at?: string
          created_by?: string | null
          email_writing_style?: string | null
          id?: string
          ideal_customer_profile?: string | null
          industry?: string | null
          name: string
          services_offered?: string | null
          typical_deal_value?: string | null
          updated_at?: string
          value_proposition?: string | null
        }
        Update: {
          business_description?: string | null
          created_at?: string
          created_by?: string | null
          email_writing_style?: string | null
          id?: string
          ideal_customer_profile?: string | null
          industry?: string | null
          name?: string
          services_offered?: string | null
          typical_deal_value?: string | null
          updated_at?: string
          value_proposition?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          expires_at: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          expires_at: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          expires_at?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      temporary_email_data: {
        Row: {
          created_at: string
          email_data: Json
          expires_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_data: Json
          expires_at?: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_data?: Json
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ai_presets: {
        Row: {
          created_at: string
          id: string
          label: string
          org_id: string
          prompt_text: string
          scope: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          org_id: string
          prompt_text: string
          scope: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          prompt_text?: string
          scope?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ai_presets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          briefing_email_opt_out: boolean
          created_at: string
          display_name: string | null
          google_access_token: string | null
          google_refresh_token: string | null
          google_token_expiry: string | null
          id: string
          inbound_email_token: string | null
          microsoft_access_token: string | null
          microsoft_refresh_token: string | null
          microsoft_token_expiry: string | null
          organization_id: string
          own_email_addresses: string[] | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          briefing_email_opt_out?: boolean
          created_at?: string
          display_name?: string | null
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id: string
          inbound_email_token?: string | null
          microsoft_access_token?: string | null
          microsoft_refresh_token?: string | null
          microsoft_token_expiry?: string | null
          organization_id: string
          own_email_addresses?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          briefing_email_opt_out?: boolean
          created_at?: string
          display_name?: string | null
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          inbound_email_token?: string | null
          microsoft_access_token?: string | null
          microsoft_refresh_token?: string | null
          microsoft_token_expiry?: string | null
          organization_id?: string
          own_email_addresses?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      batch_update_formatting: {
        Args: {
          p_direction: string
          p_entry_date: string
          p_formatted_text: string
          p_id: string
          p_subject: string
          p_type: string
          p_warnings?: Json
        }
        Returns: undefined
      }
      bulk_insert_correspondence: { Args: { entries: Json }; Returns: number }
      cleanup_expired_rate_limits: { Args: never; Returns: number }
      cleanup_expired_temp_email_data: { Args: never; Returns: undefined }
      compute_content_hash: { Args: { raw_text: string }; Returns: string }
      get_unformatted_batch:
        | {
            Args: { batch_size?: number; sort_dir?: string }
            Returns: {
              direction: string
              entry_date: string
              id: string
              raw_text_original: string
              subject: string
            }[]
          }
        | {
            Args: { p_limit?: number }
            Returns: {
              direction: string
              entry_date: string
              id: string
              raw_text_original: string
              subject: string
            }[]
          }
      get_unformatted_entries: {
        Args: { batch_offset?: number; batch_size?: number }
        Returns: {
          direction: string
          entry_date: string
          id: string
          raw_text_original: string
          subject: string
        }[]
      }
      get_user_organization_id: { Args: never; Returns: string }
      is_user_admin: { Args: never; Returns: boolean }
      mark_format_failed: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      oe_normalise_business_name: { Args: { name: string }; Returns: string }
      run_readonly_query: {
        Args: { org_id: string; query_text: string; row_limit?: number }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_formatted_entry: {
        Args: {
          p_direction: string
          p_entry_date: string
          p_extracted_names?: Json
          p_formatted_text: string
          p_id: string
          p_subject: string
          p_type: string
          p_warnings?: Json
        }
        Returns: undefined
      }
      update_formatting: {
        Args: {
          entry_id: string
          p_direction?: string
          p_entry_date?: string
          p_formatted_text: string
          p_subject: string
          p_type: string
          p_warnings?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      action_needed_type:
        | "none"
        | "prospect"
        | "follow_up"
        | "waiting_on_them"
        | "invoice"
        | "renewal"
      entry_type: "Email" | "Call" | "Meeting" | "Email Thread" | "Note"
      invitation_status: "pending" | "accepted" | "expired" | "cancelled"
      user_role: "member" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_needed_type: [
        "none",
        "prospect",
        "follow_up",
        "waiting_on_them",
        "invoice",
        "renewal",
      ],
      entry_type: ["Email", "Call", "Meeting", "Email Thread", "Note"],
      invitation_status: ["pending", "accepted", "expired", "cancelled"],
      user_role: ["member", "admin"],
    },
  },
} as const
