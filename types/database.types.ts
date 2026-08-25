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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          hotel_id: string
          id: string
          staff_id: string | null
          staff_name: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          hotel_id: string
          id?: string
          staff_id?: string | null
          staff_name?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          hotel_id?: string
          id?: string
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
            foreignKeyName: "availability_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
          check_in: string
          check_in_at: string | null
          check_out: string
          check_out_at: string | null
          children: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          estimated_arrival: string | null
          guest_id: string | null
          hotel_id: string
          id: string
          initiated_payment_refs: string[]
          internal_notes: string | null
          nights: number | null
          outstanding_balance: number | null
          payment_preference: string | null
          payment_status: string | null
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
          check_in: string
          check_in_at?: string | null
          check_out: string
          check_out_at?: string | null
          children?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          estimated_arrival?: string | null
          guest_id?: string | null
          hotel_id: string
          id?: string
          initiated_payment_refs?: string[]
          internal_notes?: string | null
          nights?: number | null
          outstanding_balance?: number | null
          payment_preference?: string | null
          payment_status?: string | null
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
          check_in?: string
          check_in_at?: string | null
          check_out?: string
          check_out_at?: string | null
          children?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          estimated_arrival?: string | null
          guest_id?: string | null
          hotel_id?: string
          id?: string
          initiated_payment_refs?: string[]
          internal_notes?: string | null
          nights?: number | null
          outstanding_balance?: number | null
          payment_preference?: string | null
          payment_status?: string | null
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
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_rate_overrides: {
        Row: {
          created_at: string
          date: string
          hotel_id: string
          id: string
          price: number
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          hotel_id: string
          id?: string
          price: number
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          hotel_id?: string
          id?: string
          price?: number
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
            foreignKeyName: "daily_rate_overrides_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
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
          arkesel_api_key: string | null
          arkesel_sender_name: string | null
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
          paystack_settlement_schedule: string | null
          paystack_subaccount_code: string | null
          phone: string | null
          plan: string | null
          settings: Json | null
          slug: string
          status: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          arkesel_api_key?: string | null
          arkesel_sender_name?: string | null
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
          paystack_settlement_schedule?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          plan?: string | null
          settings?: Json | null
          slug: string
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          arkesel_api_key?: string | null
          arkesel_sender_name?: string | null
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
          paystack_settlement_schedule?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          plan?: string | null
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
            foreignKeyName: "notification_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
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
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
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
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
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
          admin_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          hotel_id: string
          id: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          hotel_id: string
          id?: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          hotel_id?: string
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
      room_types: {
        Row: {
          amenities: Json | null
          base_price: number
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
        }
        Insert: {
          amenities?: Json | null
          base_price: number
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
        }
        Update: {
          amenities?: Json | null
          base_price?: number
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
          status: string | null
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
          status?: string | null
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
          status?: string | null
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
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_rate_overrides: {
        Row: {
          base_price: number
          created_at: string
          id: string
          room_type_id: string
          seasonal_rate_id: string
          updated_at: string
          weekend_price: number | null
        }
        Insert: {
          base_price: number
          created_at?: string
          id?: string
          room_type_id: string
          seasonal_rate_id: string
          updated_at?: string
          weekend_price?: number | null
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          room_type_id?: string
          seasonal_rate_id?: string
          updated_at?: string
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_rate_overrides_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasonal_rate_overrides_seasonal_rate_id_fkey"
            columns: ["seasonal_rate_id"]
            isOneToOne: false
            referencedRelation: "seasonal_rates"
            referencedColumns: ["id"]
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
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          hotel_id: string
          id?: string
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          hotel_id?: string
          id?: string
          name?: string
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
          is_used: boolean
          role: string
          token: string
        }
        Insert: {
          clerk_org_id: string
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          role: string
          token: string
        }
        Update: {
          clerk_org_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          role?: string
          token?: string
        }
        Relationships: []
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
      add_online_payment_to_booking: {
        Args: { p_amount: number; p_booking_id: string; p_hotel_id: string }
        Returns: number
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
      expire_stale_payment_holds: { Args: never; Returns: number }
      generate_booking_reference: {
        Args: { p_hotel_id: string; p_prefix?: string }
        Returns: string
      }
      get_user_clerk_org_ids: { Args: never; Returns: string[] }
      get_user_hotel_ids: { Args: never; Returns: string[] }
      prune_push_delivery_data: { Args: never; Returns: undefined }
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
      room_type_available_count: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_room_type_id: string
        }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_has_staff_role: {
        Args: { p_hotel_id: string; p_roles: string[] }
        Returns: boolean
      }
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
