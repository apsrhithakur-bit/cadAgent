import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Support both new and legacy key names for backward compatibility
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseAnonKey = supabasePublishableKey // Alias for backward compatibility

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY)')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

// Export both naming conventions for backward compatibility
export { supabasePublishableKey, supabaseAnonKey }

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string
          subscription_tier: 'free' | 'plus' | 'pro'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | null
          current_period_start: string | null
          current_period_end: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email: string
          subscription_tier?: 'free' | 'plus' | 'pro'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          subscription_tier?: 'free' | 'plus' | 'pro'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      usage_tracking: {
        Row: {
          id: string
          user_id: string
          designs_used: number | null
          refine_chats_used: number | null
          period_start: string
          period_end: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          designs_used?: number | null
          refine_chats_used?: number | null
          period_start: string
          period_end: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          designs_used?: number | null
          refine_chats_used?: number | null
          period_start?: string
          period_end?: string
          created_at?: string | null
          updated_at?: string | null
        }
      }
      design_sessions: {
        Row: {
          id: string
          user_id: string
          design_data: any
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          design_data?: any
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          design_data?: any
          created_at?: string | null
        }
      }
      refine_chats: {
        Row: {
          id: string
          user_id: string
          design_session_id: string | null
          message: string
          response: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          design_session_id?: string | null
          message: string
          response?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          design_session_id?: string | null
          message?: string
          response?: string | null
          created_at?: string | null
        }
      }
      stripe_customers: {
        Row: {
          id: string
          user_id: string
          customer_id: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          customer_id: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          customer_id?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      stripe_subscriptions: {
        Row: {
          id: string
          customer_id: string
          subscription_id: string | null
          price_id: string | null
          status: string
          current_period_start: number | null
          current_period_end: number | null
          cancel_at_period_end: boolean | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          subscription_id?: string | null
          price_id?: string | null
          status?: string
          current_period_start?: number | null
          current_period_end?: number | null
          cancel_at_period_end?: boolean | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          subscription_id?: string | null
          price_id?: string | null
          status?: string
          current_period_start?: number | null
          current_period_end?: number | null
          cancel_at_period_end?: boolean | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      stripe_orders: {
        Row: {
          id: string
          customer_id: string
          checkout_session_id: string
          payment_intent_id: string | null
          amount_subtotal: number | null
          amount_total: number | null
          currency: string | null
          payment_status: string | null
          status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          checkout_session_id: string
          payment_intent_id?: string | null
          amount_subtotal?: number | null
          amount_total?: number | null
          currency?: string | null
          payment_status?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          checkout_session_id?: string
          payment_intent_id?: string | null
          amount_subtotal?: number | null
          amount_total?: number | null
          currency?: string | null
          payment_status?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      shared_models: {
        Row: {
          id: string
          user_id: string | null
          model_data: any
          created_at: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          model_data: any
          created_at?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          model_data?: any
          created_at?: string | null
          expires_at?: string | null
        }
      }
    }
  }
}