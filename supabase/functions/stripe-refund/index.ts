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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const { paymentIntentId, amount, reason } = await req.json()

    console.log('🔄 Processing refund request:', { paymentIntentId, amount, reason })

    // Create the refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount, // Amount in cents, omit for full refund
      reason: reason || 'requested_by_customer',
      metadata: {
        refund_reason: reason || 'Test refund',
        processed_by: 'AgentiCAD_Admin'
      }
    })

    console.log('✅ Refund created:', refund.id)

    // If this was an extra patent searches purchase, we should deduct the searches
    if (refund.metadata?.purchaseType === 'extra_patent_searches') {
      const searchesToDeduct = parseInt(refund.metadata?.extraPatentSearches || '0')
      
      if (searchesToDeduct > 0) {
        // Find the user and deduct the searches
        // This would need more logic to identify the user from the payment
        console.log(`ℹ️ Should deduct ${searchesToDeduct} patent searches from user`)
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason
      }
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
    })

  } catch (error: any) {
    console.error('❌ Refund error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Refund failed'
      }),
      {
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      }
    )
  }
}) 