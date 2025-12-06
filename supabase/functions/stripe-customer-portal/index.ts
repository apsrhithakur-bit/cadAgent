import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Stripe from 'https://esm.sh/stripe@13.11.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the session or user object
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const { return_url } = await req.json()

    // Get user profile to find their Stripe customer ID
    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let stripeCustomerId = profile?.stripe_customer_id

    // If no stripe customer ID exists, check the stripe_customers table
    if (!stripeCustomerId) {
      console.log('No stripe_customer_id in user_profiles, checking stripe_customers table...')
      
      const { data: customerRecord, error: customerError } = await supabaseClient
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()

      if (customerError) {
        console.error('Error fetching stripe customer:', customerError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch customer information' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      if (customerRecord?.customer_id) {
        stripeCustomerId = customerRecord.customer_id
        console.log('Found customer ID in stripe_customers table:', stripeCustomerId)
        
        // Update user_profiles with the customer ID for future use
        await supabaseClient
          .from('user_profiles')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', user.id)
      }
    }

    // If still no customer ID, create a new customer
    if (!stripeCustomerId) {
      console.log('No existing customer found, creating new Stripe customer...')
      
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
      })

      stripeCustomerId = newCustomer.id
      console.log('Created new Stripe customer:', stripeCustomerId)

      // Save to both tables
      await supabaseClient.from('stripe_customers').insert({
        user_id: user.id,
        customer_id: stripeCustomerId,
      })

      await supabaseClient
        .from('user_profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id)
    }

    console.log('Using Stripe customer ID:', stripeCustomerId)

    // Create customer portal session
    // Get the appropriate return URL, prioritizing provided URL, then origin header, then smart fallback
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^\/]*$/, '')
    const fallbackUrl = origin?.includes('localhost') ? 'http://localhost:5173' : 'https://agenticad.store'
    const finalReturnUrl = return_url || origin || fallbackUrl
    
    console.log('Customer portal return URL setup:', {
      provided_return_url: return_url,
      origin_header: req.headers.get('origin'),
      referer_header: req.headers.get('referer'),
      calculated_origin: origin,
      fallback_url: fallbackUrl,
      final_return_url: finalReturnUrl
    })

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: finalReturnUrl,
    })

    return new Response(
      JSON.stringify({ url: portalSession.url }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error creating customer portal session:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
}) 