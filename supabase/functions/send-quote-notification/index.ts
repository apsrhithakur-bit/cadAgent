import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QuoteRequest {
  id: string
  user_id: string
  manufacturer_id: string
  manufacturer_name: string
  manufacturer_contact: any
  design_id?: string
  design_name?: string
  project_details: {
    materials: string[]
    method: string
    quantity: number
    complexity: string
    timeline: string
    special_requirements?: string
  }
  contact_info: {
    email: string
    phone?: string
    company?: string
  }
  status: string
  created_at: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { quoteRequest, type } = await req.json()

    console.log('Processing quote notification:', { type, quoteId: quoteRequest.id })

    // For now, we'll just log the notification
    // In production, you would integrate with an email service like SendGrid, AWS SES, etc.
    
    if (type === 'new_quote_request') {
      console.log('New quote request notification:', {
        to: quoteRequest.manufacturer_contact?.email || 'manufacturer@example.com',
        from: quoteRequest.contact_info.email,
        subject: `New Quote Request - ${quoteRequest.design_name}`,
        manufacturer: quoteRequest.manufacturer_name,
        project: {
          name: quoteRequest.design_name,
          materials: quoteRequest.project_details.materials.join(', '),
          method: quoteRequest.project_details.method,
          quantity: quoteRequest.project_details.quantity,
          timeline: quoteRequest.project_details.timeline,
          requirements: quoteRequest.project_details.special_requirements
        },
        contact: {
          email: quoteRequest.contact_info.email,
          phone: quoteRequest.contact_info.phone,
          company: quoteRequest.contact_info.company
        }
      })

      // Update quote status to 'sent'
      await supabase
        .from('quote_requests')
        .update({ 
          status: 'sent', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', quoteRequest.id)

      console.log('Quote request marked as sent')
    }

    // TODO: Implement actual email sending
    // Example with a hypothetical email service:
    /*
    const emailService = new EmailService(Deno.env.get('EMAIL_API_KEY'))
    await emailService.send({
      to: quoteRequest.manufacturer_contact?.email,
      subject: `New Quote Request - ${quoteRequest.design_name}`,
      template: 'quote_request',
      data: {
        manufacturer_name: quoteRequest.manufacturer_name,
        project_name: quoteRequest.design_name,
        materials: quoteRequest.project_details.materials.join(', '),
        method: quoteRequest.project_details.method,
        quantity: quoteRequest.project_details.quantity,
        timeline: quoteRequest.project_details.timeline,
        requirements: quoteRequest.project_details.special_requirements,
        contact_email: quoteRequest.contact_info.email,
        contact_phone: quoteRequest.contact_info.phone,
        contact_company: quoteRequest.contact_info.company
      }
    })
    */

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Quote notification processed successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error processing quote notification:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})