export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ari_sync_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          date_from: string
          date_to: string
          hotel_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          rate_plan_id: string | null
          room_type_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          date_from: string
          date_to: string
          hotel_id: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          rate_plan_id?: string | null
          room_type_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          date_from?: string
          date_to?: string
          hotel_id?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          rate_plan_id?: string | null
          room_type_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ari_sync_outbox_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          category: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          hotel_id: string
          id: string
          search_text: string | null
          staff_id: string | null
          staff_name: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          category?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          hotel_id: string
          id?: string
          search_text?: string | null
          staff_id?: string | null
          staff_name?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          category?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          hotel_id?: string
          id?: string
          search_text?: string | null
          staff_id?: string | null
          staff_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_block_history: {
        Row: {
          block_id: string
          end_date: string
          hotel_id: string
          id: number
          room_id: string
          source: string
          start_date: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          block_id: string
          end_date: string
          hotel_id: string
          id?: never
          room_id: string
          source: string
          start_date: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          block_id?: string
          end_date?: string
          hotel_id?: string
          id?: never
          room_id?: string
          source?: string
          start_date?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_block_history_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string
          hotel_id: string
          id: string
          notes: string | null
          reason: string | null
          room_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date: string
          hotel_id: string
          id?: string
          notes?: string | null
          reason?: string | null
          room_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          hotel_id?: string
          id?: string
          notes?: string | null
          reason?: string | null
          room_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_room_hotel_fk"
            columns: ["room_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      booking_nights: {
        Row: {
          booking_id: string
          created_at: string
          currency: string
          hotel_id: string
          id: string
          occupancy: number
          rate_minor: number
          rate_plan_id: string | null
          rooms_count: number
          season_name: string | null
          seasonal_rate_id: string | null
          source: string
          stay_date: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          currency: string
          hotel_id: string
          id?: string
          occupancy?: number
          rate_minor: number
          rate_plan_id?: string | null
          rooms_count?: number
          season_name?: string | null
          seasonal_rate_id?: string | null
          source: string
          stay_date: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          currency?: string
          hotel_id?: string
          id?: string
          occupancy?: number
          rate_minor?: number
          rate_plan_id?: string | null
          rooms_count?: number
          season_name?: string | null
          seasonal_rate_id?: string | null
          source?: string
          stay_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_nights_booking_hotel_fk"
            columns: ["booking_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "booking_nights_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reference_counters: {
        Row: {
          hotel_id: string
          last_seq: number
          year: string
        }
        Insert: {
          hotel_id: string
          last_seq?: number
          year: string
        }
        Update: {
          hotel_id?: string
          last_seq?: number
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reference_counters_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number | null
          amount_paid: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_provider: string | null
          check_in: string
          check_in_at: string | null
          check_out: string
          check_out_at: string | null
          children: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          estimated_arrival: string | null
          external_booking_id: string | null
          group_id: string | null
          guest_id: string | null
          hotel_id: string
          id: string
          initiated_payment_refs: string[]
          internal_notes: string | null
          nights: number | null
          outstanding_balance: number | null
          payment_preference: string | null
          payment_status: string | null
          rate_plan_id: string | null
          reference: string
          room_id: string | null
          room_rate: number
          room_type_id: string | null
          rooms_count: number
          source: string | null
          special_requests: string | null
          status: string | null
          subtotal: number
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          adults?: number | null
          amount_paid?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_provider?: string | null
          check_in: string
          check_in_at?: string | null
          check_out: string
          check_out_at?: string | null
          children?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          estimated_arrival?: string | null
          external_booking_id?: string | null
          group_id?: string | null
          guest_id?: string | null
          hotel_id: string
          id?: string
          initiated_payment_refs?: string[]
          internal_notes?: string | null
          nights?: number | null
          outstanding_balance?: number | null
          payment_preference?: string | null
          payment_status?: string | null
          rate_plan_id?: string | null
          reference: string
          room_id?: string | null
          room_rate: number
          room_type_id?: string | null
          rooms_count?: number
          source?: string | null
          special_requests?: string | null
          status?: string | null
          subtotal: number
          tax_amount?: number | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          adults?: number | null
          amount_paid?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_provider?: string | null
          check_in?: string
          check_in_at?: string | null
          check_out?: string
          check_out_at?: string | null
          children?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          estimated_arrival?: string | null
          external_booking_id?: string | null
          group_id?: string | null
          guest_id?: string | null
          hotel_id?: string
          id?: string
          initiated_payment_refs?: string[]
          internal_notes?: string | null
          nights?: number | null
          outstanding_balance?: number | null
          payment_preference?: string | null
          payment_status?: string | null
          rate_plan_id?: string | null
          reference?: string
          room_id?: string | null
          room_rate?: number
          room_type_id?: string | null
          rooms_count?: number
          source?: string | null
          special_requests?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_group_hotel_fk"
            columns: ["group_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "bookings_guest_hotel_fk"
            columns: ["guest_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_rate_plan_hotel_fk"
            columns: ["rate_plan_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "bookings_room_hotel_fk"
            columns: ["room_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "bookings_room_type_hotel_fk"
            columns: ["room_type_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      business_date_closes: {
        Row: {
          business_date: string
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          hotel_id: string
          id: string
          legacy_audit_log_id: string | null
          notes: string | null
          source: string
          summary: Json
          time_zone: string | null
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          hotel_id: string
          id?: string
          legacy_audit_log_id?: string | null
          notes?: string | null
          source: string
          summary: Json
          time_zone?: string | null
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          hotel_id?: string
          id?: string
          legacy_audit_log_id?: string | null
          notes?: string | null
          source?: string
          summary?: Json
          time_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_date_closes_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_credentials: {
        Row: {
          api_key_ref: string
          channel_property_id: string
          created_at: string
          hotel_id: string
          id: string
          updated_at: string
        }
        Insert: {
          api_key_ref: string
          channel_property_id: string
          created_at?: string
          hotel_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          api_key_ref?: string
          channel_property_id?: string
          created_at?: string
          hotel_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_credentials_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_credentials_property_fkey"
            columns: ["channel_property_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "channel_properties"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      channel_properties: {
        Row: {
          created_at: string
          external_property_id: string
          hotel_id: string
          id: string
          is_enabled: boolean
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_property_id: string
          hotel_id: string
          id?: string
          is_enabled?: boolean
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_property_id?: string
          hotel_id?: string
          id?: string
          is_enabled?: boolean
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_properties_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_rate_plan_mappings: {
        Row: {
          channel_property_id: string
          created_at: string
          external_rate_plan_id: string
          hotel_id: string
          id: string
          rate_plan_id: string
          updated_at: string
        }
        Insert: {
          channel_property_id: string
          created_at?: string
          external_rate_plan_id: string
          hotel_id: string
          id?: string
          rate_plan_id: string
          updated_at?: string
        }
        Update: {
          channel_property_id?: string
          created_at?: string
          external_rate_plan_id?: string
          hotel_id?: string
          id?: string
          rate_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_rate_plan_mappings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_rate_plan_mappings_property_fkey"
            columns: ["channel_property_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "channel_properties"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "channel_rate_plan_mappings_rate_plan_fkey"
            columns: ["rate_plan_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      channel_room_type_mappings: {
        Row: {
          channel_property_id: string
          created_at: string
          external_room_type_id: string
          hotel_id: string
          id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          channel_property_id: string
          created_at?: string
          external_room_type_id: string
          hotel_id: string
          id?: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          channel_property_id?: string
          created_at?: string
          external_room_type_id?: string
          hotel_id?: string
          id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_room_type_mappings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_room_type_mappings_property_fkey"
            columns: ["channel_property_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "channel_properties"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "channel_room_type_mappings_room_type_fkey"
            columns: ["room_type_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      daily_rate_overrides: {
        Row: {
          created_at: string
          date: string
          hotel_id: string
          id: string
          occupancy: number
          price: number
          price_minor: number
          rate_plan_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          hotel_id: string
          id?: string
          occupancy?: number
          price: number
          price_minor: number
          rate_plan_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          hotel_id?: string
          id?: string
          occupancy?: number
          price?: number
          price_minor?: number
          rate_plan_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_rate_overrides_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_rate_overrides_rate_plan_fk"
            columns: ["rate_plan_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "daily_rate_overrides_room_type_fk"
            columns: ["room_type_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          hotel_id: string
          id: string
          last_stay_date: string | null
          national_id: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          tags: Json | null
          total_spend: number | null
          total_stays: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          hotel_id: string
          id?: string
          last_stay_date?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          tags?: Json | null
          total_spend?: number | null
          total_stays?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          hotel_id?: string
          id?: string
          last_stay_date?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          tags?: Json | null
          total_spend?: number | null
          total_stays?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          address: string | null
          cancellation_policy: string | null
          check_in_time: string | null
          check_out_time: string | null
          city: string | null
          clerk_org_id: string
          country: string | null
          cover_image_url: string | null
          created_at: string | null
          currency: string | null
          custom_domain: string | null
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          paystack_account_number: string | null
          paystack_bank_code: string | null
          paystack_business_name: string | null
          paystack_domain: string | null
          paystack_settlement_schedule: string | null
          paystack_subaccount_code: string | null
          phone: string | null
          settings: Json | null
          slug: string
          status: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          cancellation_policy?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string | null
          clerk_org_id: string
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          paystack_account_number?: string | null
          paystack_bank_code?: string | null
          paystack_business_name?: string | null
          paystack_domain?: string | null
          paystack_settlement_schedule?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          settings?: Json | null
          slug: string
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          cancellation_policy?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string | null
          clerk_org_id?: string
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          paystack_account_number?: string | null
          paystack_bank_code?: string | null
          paystack_business_name?: string | null
          paystack_domain?: string | null
          paystack_settlement_schedule?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          settings?: Json | null
          slug?: string
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_delivery_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          delivered_subscription_ids: string[]
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          notification_id: string
          recipient_staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          delivered_subscription_ids?: string[]
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          notification_id: string
          recipient_staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          delivered_subscription_ids?: string[]
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          notification_id?: string
          recipient_staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_outbox_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string
          error_message: string | null
          event_type: string
          hotel_id: string
          id: string
          provider: string
          provider_message_id: string | null
          recipient: string
          status: string
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string
          error_message?: string | null
          event_type: string
          hotel_id: string
          id?: string
          provider: string
          provider_message_id?: string | null
          recipient: string
          status?: string
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          hotel_id?: string
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_booking_hotel_fk"
            columns: ["booking_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "notification_logs_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          booking_id: string | null
          created_at: string | null
          created_by_staff_id: string | null
          dedupe_key: string | null
          hotel_id: string
          id: string
          is_read: boolean | null
          message: string
          read_at: string | null
          recipient_staff_id: string | null
          title: string
          type: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          booking_id?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          dedupe_key?: string | null
          hotel_id: string
          id?: string
          is_read?: boolean | null
          message: string
          read_at?: string | null
          recipient_staff_id?: string | null
          title: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          booking_id?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          dedupe_key?: string | null
          hotel_id?: string
          id?: string
          is_read?: boolean | null
          message?: string
          read_at?: string | null
          recipient_staff_id?: string | null
          title?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_hotel_fk"
            columns: ["booking_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "notifications_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_minor: number
          booking_id: string
          created_at: string
          currency: string
          expected_subaccount_code: string
          hotel_id: string
          id: string
          initialized_at: string | null
          last_reconciled_at: string | null
          metadata: Json
          paystack_id: string | null
          paystack_reference: string
          provider_response: Json | null
          settled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id: string
          created_at?: string
          currency: string
          expected_subaccount_code: string
          hotel_id: string
          id?: string
          initialized_at?: string | null
          last_reconciled_at?: string | null
          metadata?: Json
          paystack_id?: string | null
          paystack_reference: string
          provider_response?: Json | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string
          created_at?: string
          currency?: string
          expected_subaccount_code?: string
          hotel_id?: string
          id?: string
          initialized_at?: string | null
          last_reconciled_at?: string | null
          metadata?: Json
          paystack_id?: string | null
          paystack_reference?: string
          provider_response?: Json | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_booking_hotel_fk"
            columns: ["booking_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "payment_attempts_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string | null
          currency: string | null
          hotel_id: string
          id: string
          metadata: Json | null
          method: string | null
          notes: string | null
          paid_at: string | null
          paystack_id: string | null
          paystack_reference: string | null
          paystack_subaccount: string | null
          platform_fee: number | null
          recorded_by: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string | null
          currency?: string | null
          hotel_id: string
          id?: string
          metadata?: Json | null
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          paystack_id?: string | null
          paystack_reference?: string | null
          paystack_subaccount?: string | null
          platform_fee?: number | null
          recorded_by?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string | null
          currency?: string | null
          hotel_id?: string
          id?: string
          metadata?: Json | null
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          paystack_id?: string | null
          paystack_reference?: string | null
          paystack_subaccount?: string | null
          platform_fee?: number | null
          recorded_by?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_hotel_fk"
            columns: ["booking_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "payments_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_audit_logs: {
        Row: {
          action: string
          admin_email: string
          admin_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          hotel_id: string | null
          id: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          hotel_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          hotel_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admin_audit_logs_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          role: string | null
          supabase_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          role?: string | null
          supabase_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          role?: string | null
          supabase_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          fee_flat_currency: string
          fee_flat_minor: number
          fee_percent: number
          fee_type: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fee_flat_currency?: string
          fee_flat_minor?: number
          fee_percent?: number
          fee_type?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fee_flat_currency?: string
          fee_flat_minor?: number
          fee_percent?: number
          fee_type?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_name: string | null
          disabled_at: string | null
          endpoint: string
          expires_at: string | null
          hotel_id: string
          id: string
          last_seen_at: string
          p256dh: string
          staff_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          device_name?: string | null
          disabled_at?: string | null
          endpoint: string
          expires_at?: string | null
          hotel_id: string
          id?: string
          last_seen_at?: string
          p256dh: string
          staff_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          device_name?: string | null
          disabled_at?: string | null
          endpoint?: string
          expires_at?: string | null
          hotel_id?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          staff_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_plans: {
        Row: {
          auto_rate_settings: Json | null
          code: string
          created_at: string
          currency: string | null
          derived_rules: Json | null
          hotel_id: string
          id: string
          is_active: boolean
          is_default: boolean
          meal_type: string
          parent_rate_plan_id: string | null
          rate_mode: string
          room_type_id: string
          sell_mode: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_rate_settings?: Json | null
          code: string
          created_at?: string
          currency?: string | null
          derived_rules?: Json | null
          hotel_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          meal_type?: string
          parent_rate_plan_id?: string | null
          rate_mode?: string
          room_type_id: string
          sell_mode?: string
          title: string
          updated_at?: string
        }
        Update: {
          auto_rate_settings?: Json | null
          code?: string
          created_at?: string
          currency?: string | null
          derived_rules?: Json | null
          hotel_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          meal_type?: string
          parent_rate_plan_id?: string | null
          rate_mode?: string
          room_type_id?: string
          sell_mode?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_parent_fk"
            columns: ["parent_rate_plan_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "rate_plans_room_type_fk"
            columns: ["room_type_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      rate_restrictions: {
        Row: {
          closed_to_arrival: boolean
          closed_to_departure: boolean
          created_at: string
          date: string
          hotel_id: string
          id: string
          max_stay: number | null
          min_stay: number | null
          min_stay_arrival: number | null
          min_stay_through: number | null
          rate_plan_id: string
          stop_sell: boolean
          updated_at: string
        }
        Insert: {
          closed_to_arrival?: boolean
          closed_to_departure?: boolean
          created_at?: string
          date: string
          hotel_id: string
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          min_stay_arrival?: number | null
          min_stay_through?: number | null
          rate_plan_id: string
          stop_sell?: boolean
          updated_at?: string
        }
        Update: {
          closed_to_arrival?: boolean
          closed_to_departure?: boolean
          created_at?: string
          date?: string
          hotel_id?: string
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          min_stay_arrival?: number | null
          min_stay_through?: number | null
          rate_plan_id?: string
          stop_sell?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_restrictions_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_restrictions_rate_plan_fk"
            columns: ["rate_plan_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      reports_inventory_history: {
        Row: {
          capacity_by_type: Json
          captured_at: string
          effective_date: string
          hotel_id: string
          id: string
          time_zone: string
        }
        Insert: {
          capacity_by_type: Json
          captured_at?: string
          effective_date: string
          hotel_id: string
          id?: string
          time_zone: string
        }
        Update: {
          capacity_by_type?: Json
          captured_at?: string
          effective_date?: string
          hotel_id?: string
          id?: string
          time_zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_inventory_history_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      room_status_history: {
        Row: {
          hotel_id: string
          id: number
          room_id: string
          source: string
          status: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          hotel_id: string
          id?: never
          room_id: string
          source: string
          status: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          hotel_id?: string
          id?: never
          room_id?: string
          source?: string
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_status_history_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          amenities: Json | null
          base_price: number
          base_price_minor: number
          bed_configuration: string | null
          created_at: string | null
          description: string | null
          hotel_id: string
          id: string
          images: Json | null
          is_active: boolean | null
          max_adults: number | null
          max_children: number | null
          name: string
          short_description: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
          weekend_price: number | null
          weekend_price_minor: number | null
        }
        Insert: {
          amenities?: Json | null
          base_price: number
          base_price_minor: number
          bed_configuration?: string | null
          created_at?: string | null
          description?: string | null
          hotel_id: string
          id?: string
          images?: Json | null
          is_active?: boolean | null
          max_adults?: number | null
          max_children?: number | null
          name: string
          short_description?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
          weekend_price?: number | null
          weekend_price_minor?: number | null
        }
        Update: {
          amenities?: Json | null
          base_price?: number
          base_price_minor?: number
          bed_configuration?: string | null
          created_at?: string | null
          description?: string | null
          hotel_id?: string
          id?: string
          images?: Json | null
          is_active?: boolean | null
          max_adults?: number | null
          max_children?: number | null
          name?: string
          short_description?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
          weekend_price?: number | null
          weekend_price_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string | null
          floor: string | null
          hotel_id: string
          id: string
          is_active: boolean | null
          notes: string | null
          room_number: string
          room_type_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          floor?: string | null
          hotel_id: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          room_number: string
          room_type_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          floor?: string | null
          hotel_id?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          room_number?: string
          room_type_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_room_type_hotel_fk"
            columns: ["room_type_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      seasonal_rate_overrides: {
        Row: {
          base_price: number
          base_price_minor: number
          created_at: string
          hotel_id: string
          id: string
          occupancy: number
          rate_plan_id: string
          room_type_id: string
          seasonal_rate_id: string
          updated_at: string
          weekend_price: number | null
          weekend_price_minor: number | null
        }
        Insert: {
          base_price: number
          base_price_minor: number
          created_at?: string
          hotel_id: string
          id?: string
          occupancy?: number
          rate_plan_id: string
          room_type_id: string
          seasonal_rate_id: string
          updated_at?: string
          weekend_price?: number | null
          weekend_price_minor?: number | null
        }
        Update: {
          base_price?: number
          base_price_minor?: number
          created_at?: string
          hotel_id?: string
          id?: string
          occupancy?: number
          rate_plan_id?: string
          room_type_id?: string
          seasonal_rate_id?: string
          updated_at?: string
          weekend_price?: number | null
          weekend_price_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_rate_overrides_rate_plan_fk"
            columns: ["rate_plan_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "seasonal_rate_overrides_room_type_fk"
            columns: ["room_type_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "hotel_id"]
          },
          {
            foreignKeyName: "seasonal_rate_overrides_seasonal_rate_fk"
            columns: ["seasonal_rate_id", "hotel_id"]
            isOneToOne: false
            referencedRelation: "seasonal_rates"
            referencedColumns: ["id", "hotel_id"]
          },
        ]
      }
      seasonal_rates: {
        Row: {
          created_at: string
          end_date: string
          hotel_id: string
          id: string
          name: string
          priority: number
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          hotel_id: string
          id?: string
          name: string
          priority?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          hotel_id?: string
          id?: string
          name?: string
          priority?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_rates_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          clerk_org_id: string
          created_at: string
          expires_at: string
          id: string
          invited_by_staff_id: string | null
          is_used: boolean
          role: string
          token: string
        }
        Insert: {
          clerk_org_id: string
          created_at?: string
          expires_at: string
          id?: string
          invited_by_staff_id?: string | null
          is_used?: boolean
          role: string
          token: string
        }
        Update: {
          clerk_org_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by_staff_id?: string | null
          is_used?: boolean
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_invited_by_staff_id_fkey"
            columns: ["invited_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          avatar_url: string | null
          clerk_org_id: string
          clerk_user_id: string
          created_at: string | null
          email: string
          full_name: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          notification_prefs: Json | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          clerk_org_id: string
          clerk_user_id: string
          created_at?: string | null
          email: string
          full_name?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          notification_prefs?: Json | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          clerk_org_id?: string
          clerk_user_id?: string
          created_at?: string | null
          email?: string
          full_name?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          notification_prefs?: Json | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abort_unpaid_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      abort_unpaid_group: {
        Args: { p_group_id: string; p_reason: string }
        Returns: number
      }
      add_online_payment_to_booking: {
        Args: { p_amount: number; p_booking_id: string; p_hotel_id: string }
        Returns: number
      }
      ari_distribution_active: {
        Args: { p_hotel_id: string }
        Returns: boolean
      }
      ari_snapshot: {
        Args: {
          p_from: string
          p_hotel_id: string
          p_room_type_ids?: string[]
          p_to: string
        }
        Returns: {
          availability: number
          closed_to_arrival: boolean
          closed_to_departure: boolean
          currency: string
          max_stay: number
          min_stay: number
          min_stay_arrival: number
          min_stay_through: number
          occupancy: number
          rate_minor: number
          rate_plan_id: string
          room_type_id: string
          stay_date: string
          stop_sell: boolean
        }[]
      }
      backfill_booking_nights: {
        Args: { p_hotel_id?: string }
        Returns: number
      }
      booking_nights_drift: {
        Args: { p_hotel_id: string }
        Returns: {
          booking_id: string
          check_in: string
          check_out: string
          currency: string
          difference_minor: number
          nights_expected: number
          nights_recorded: number
          nights_total_minor: number
          reference: string
          room_revenue_minor: number
          status: string
        }[]
      }
      check_room_availability: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_booking_id?: string
          p_room_id: string
        }
        Returns: {
          booking_id: string
          check_in: string
          check_out: string
          guest_name: string
          reference: string
          status: string
        }[]
      }
      claim_ari_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          created_at: string
          date_from: string
          date_to: string
          hotel_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          rate_plan_id: string | null
          room_type_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ari_sync_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_push_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          delivered_subscription_ids: string[]
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          notification_id: string
          recipient_staff_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_delivery_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_night_audit: {
        Args: { p_business_date: string; p_hotel_id: string; p_notes?: string }
        Returns: Json
      }
      create_booking_atomic: { Args: { p_payload: Json }; Returns: Json }
      create_booking_group_atomic: { Args: { p_payload: Json }; Returns: Json }
      currency_exponent: { Args: { p_currency: string }; Returns: number }
      dispatch_daily_stay_reminders: { Args: never; Returns: number }
      effective_rate_plan_id: {
        Args: {
          p_hotel_id: string
          p_rate_plan_id?: string
          p_room_type_id: string
        }
        Returns: string
      }
      enqueue_ari_dirty: {
        Args: {
          p_from: string
          p_hotel_id: string
          p_rate_plan_id?: string
          p_room_type_id?: string
          p_to: string
        }
        Returns: undefined
      }
      expire_stale_payment_holds: { Args: never; Returns: number }
      from_minor: {
        Args: { p_currency: string; p_minor: number }
        Returns: number
      }
      generate_booking_reference: {
        Args: { p_hotel_id: string; p_prefix?: string }
        Returns: string
      }
      get_night_audit_summary: {
        Args: { p_business_date?: string; p_hotel_id: string }
        Returns: Json
      }
      get_user_clerk_org_ids: { Args: never; Returns: string[] }
      get_user_hotel_ids: { Args: never; Returns: string[] }
      hotel_currency: { Args: { p_hotel_id: string }; Returns: string }
      pick_best_room_for_booking: {
        Args: { p_booking_id: string; p_hotel_id: string }
        Returns: string
      }
      prune_push_delivery_data: { Args: never; Returns: undefined }
      prune_rate_and_ari_data: {
        Args: { p_batch_limit?: number; p_prune_history?: boolean }
        Returns: {
          capped: boolean
          relation: string
          rows_deleted: number
        }[]
      }
      rate_and_ari_retention_preview: {
        Args: never
        Returns: {
          oldest: string
          relation: string
          rows_eligible: number
        }[]
      }
      reconcile_pending_payments: { Args: never; Returns: number }
      record_payment_atomic: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_currency: string
          p_hotel_id: string
          p_method: string
          p_notes: string
          p_recorded_by: string
        }
        Returns: {
          payment_id: string
          payment_status: string
        }[]
      }
      record_paystack_refund_atomic: {
        Args: {
          p_currency: string
          p_refund_amount_minor: number
          p_refund_id: string
          p_transaction_reference: string
        }
        Returns: {
          booking_id: string
          hotel_id: string
          payment_status: string
          result: string
        }[]
      }
      reorder_room_types: {
        Args: { p_hotel_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      reprice_booking_stay: { Args: { p_payload: Json }; Returns: Json }
      resolve_nightly_rates: {
        Args: {
          p_from: string
          p_hotel_id: string
          p_occupancy?: number
          p_rate_plan_id?: string
          p_room_type_ids: string[]
          p_to: string
        }
        Returns: {
          active_season_name: string
          active_seasonal_rate_id: string
          currency: string
          is_weekend: boolean
          occupancy: number
          rate_minor: number
          rate_plan_id: string
          room_type_id: string
          season_name: string
          seasonal_rate_id: string
          source: string
          stay_date: string
        }[]
      }
      room_type_availability_by_date: {
        Args: {
          p_exclude_booking_id?: string
          p_from: string
          p_room_type_ids: string[]
          p_to: string
        }
        Returns: {
          available: number
          blocked: number
          booked: number
          capacity: number
          room_type_id: string
          stay_date: string
        }[]
      }
      room_type_available_count: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_room_type_id: string
        }
        Returns: number
      }
      room_type_available_counts: {
        Args: { p_from: string; p_room_type_ids: string[]; p_to: string }
        Returns: {
          available: number
          room_type_id: string
        }[]
      }
      room_type_stay_restrictions: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_hotel_id: string
          p_room_type_ids: string[]
        }
        Returns: {
          rate_plan_id: string
          room_type_id: string
          violations: string[]
        }[]
      }
      settle_online_group_payment_atomic: {
        Args: {
          p_amount_minor: number
          p_currency: string
          p_group_id: string
          p_hotel_id: string
          p_metadata: Json
          p_paystack_id: string
          p_paystack_reference: string
          p_subaccount_code: string
        }
        Returns: {
          all_confirmed: boolean
          already_recorded: boolean
          amount_paid_minor: number
          group_id: string
          line_count: number
          result: string
        }[]
      }
      settle_online_payment_atomic: {
        Args: {
          p_amount_minor: number
          p_booking_id: string
          p_currency: string
          p_hotel_id: string
          p_metadata: Json
          p_paystack_id: string
          p_paystack_reference: string
          p_subaccount_code: string
        }
        Returns: {
          already_recorded: boolean
          amount_paid_minor: number
          booking_id: string
          booking_status: string
          partial_payment: boolean
          payment_status: string
          result: string
        }[]
      }
      staff_role_level: { Args: { p_role: string }; Returns: number }
      stay_restriction_violations: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_rate_plan_id: string
        }
        Returns: string[]
      }
      to_minor: {
        Args: { p_amount: number; p_currency: string }
        Returns: number
      }
      trigger_push_delivery_worker: { Args: never; Returns: undefined }
      update_platform_fee_atomic: {
        Args: {
          p_admin_email: string
          p_admin_id: string
          p_fee_flat_currency: string
          p_fee_flat_minor: number
          p_fee_percent: number
          p_fee_type: string
        }
        Returns: undefined
      }
      user_has_staff_role: {
        Args: { p_hotel_id: string; p_roles: string[] }
        Returns: boolean
      }
      user_role_at_least: {
        Args: { p_hotel_id: string; p_min_role: string }
        Returns: boolean
      }
      user_role_at_least_org: {
        Args: { p_clerk_org_id: string; p_min_role: string }
        Returns: boolean
      }
      user_role_level: { Args: { p_hotel_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
