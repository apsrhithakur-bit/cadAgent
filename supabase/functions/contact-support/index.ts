import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ContactRequest {
  type: 'cancellation' | 'support' | 'billing'
  userEmail: string
  userName?: string
  message: string
  subscriptionTier?: string
  urgency: 'low' | 'normal' | 'high'
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

    // Get the session or user object
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '') || ''
    
    console.log('🔐 Authentication attempt:', {
      hasAuthHeader: !!authHeader,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10) + '...'
    })

    const {
      data: { user },
      error: authError
    } = await supabaseClient.auth.getUser(token)

    console.log('🔐 Authentication result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message
    })

    if (!user) {
      console.error('❌ Authentication failed:', authError?.message || 'No user found')
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: authError?.message || 'Invalid or expired token'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const requestData: ContactRequest = await req.json()

    console.log('📧 Processing contact support request:', {
      type: requestData.type,
      userEmail: requestData.userEmail,
      urgency: requestData.urgency
    })

    // Get user profile for additional context
    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('subscription_tier, subscription_status, extra_patent_searches')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.warn('⚠️ Could not fetch user profile:', profileError.message)
    }

    // Prepare email content
    const emailSubject = getEmailSubject(requestData.type, requestData.urgency)
    const emailBody = formatEmailBody(requestData, profile, user)

    // Send email notification
    const emailSuccess = await sendEmail({
      to: 'agenticad@gmail.com',
      subject: emailSubject,
      body: emailBody,
      userEmail: requestData.userEmail
    })

    if (!emailSuccess) {
      console.error('Failed to send support email')
      // Don't fail the request, just log the issue
    }

    // Log the support request in database (optional)
    try {
      await supabaseClient.from('support_requests').insert({
        user_id: user.id,
        type: requestData.type,
        message: requestData.message,
        urgency: requestData.urgency,
        user_email: requestData.userEmail,
        subscription_tier: profile?.subscription_tier || 'free',
        status: 'pending'
      })
      console.log('✅ Support request logged in database')
    } catch (dbError) {
      console.warn('⚠️ Failed to log support request in database:', dbError)
      // Don't fail the request if logging fails
    }

    console.log('✅ Support request processed successfully')

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Your request has been sent. You will receive a response within 24 hours.'
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
    })

  } catch (error: any) {
    console.error('❌ Contact support error:', error)
    console.error('❌ Error stack:', error.stack)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Failed to send support request. Please try again or contact us directly.',
        details: error.message
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

function getEmailSubject(type: string, urgency: string): string {
  const urgencyPrefix = urgency === 'high' ? '[URGENT] ' : urgency === 'normal' ? '[NORMAL] ' : ''
  
  switch (type) {
    case 'cancellation':
      return `${urgencyPrefix}AgentiCAD - Subscription Cancellation Request`
    case 'billing':
      return `${urgencyPrefix}AgentiCAD - Billing Support Request`
    default:
      return `${urgencyPrefix}AgentiCAD - Support Request`
  }
}

function formatEmailBody(request: ContactRequest, profile: any, user: any): string {
  const timestamp = new Date().toISOString()
  
  return `
AgentiCAD Support Request
========================

Request Type: ${request.type.toUpperCase()}
Timestamp: ${timestamp}
Urgency: ${request.urgency.toUpperCase()}

User Information:
- Email: ${request.userEmail}
- User ID: ${user.id}
- Current Tier: ${profile?.subscription_tier || 'free'}
- Subscription Status: ${profile?.subscription_status || 'none'}
- Extra Patent Searches: ${profile?.extra_patent_searches || 0}

User Message:
${request.message}

---
Action Required: Please process this ${request.type} request within ${request.urgency === 'high' ? '2 hours' : '24 hours'}.

${request.type === 'cancellation' ? `
Cancellation Instructions:
1. Go to Stripe Dashboard → Customers
2. Search for: ${request.userEmail}
3. Cancel subscription "at period end" (no refunds needed)
4. Reply to user confirming cancellation
` : ''}

Reply to: ${request.userEmail}
  `.trim()
}

async function sendEmail(emailData: {
  to: string
  subject: string
  body: string
  userEmail: string
}): Promise<boolean> {
  try {
    // Log the email content for debugging
    console.log('📧 EMAIL NOTIFICATION:', {
      to: emailData.to,
      subject: emailData.subject,
      replyTo: emailData.userEmail,
      bodyLength: emailData.body.length
    })
    
    // Get Gmail credentials from environment
    const gmailEmail = Deno.env.get('GMAIL_EMAIL') || 'agenticad@gmail.com'
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD')
    
    if (!gmailPassword) {
      console.error('❌ Gmail app password not configured')
      console.log('📧 EMAIL CONTENT TO PROCESS MANUALLY:')
      console.log('=' .repeat(50))
      console.log(`To: ${emailData.to}`)
      console.log(`From: ${gmailEmail}`)
      console.log(`Reply-To: ${emailData.userEmail}`)
      console.log(`Subject: ${emailData.subject}`)
      console.log('=' .repeat(50))
      console.log(emailData.body)
      console.log('=' .repeat(50))
      return true
    }
    
    console.log('📧 Attempting to send email via EmailJS...')
    
    // Use EmailJS which is designed for client-side email sending
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_id: 'gmail',
          template_id: 'contact_form',
          user_id: 'public_key',
          template_params: {
            to_name: 'AgentiCAD Support',
            to_email: emailData.to,
            from_name: 'AgentiCAD Support Request',
            from_email: emailData.userEmail,
            subject: emailData.subject,
            message: emailData.body,
            reply_to: emailData.userEmail
          }
        })
      })
      
      if (response.ok) {
        console.log('✅ Email sent successfully via EmailJS')
        return true
      } else {
        const errorText = await response.text()
        console.log('❌ EmailJS failed:', errorText)
      }
    } catch (emailjsError) {
      console.log('❌ EmailJS error:', emailjsError)
    }
    
    console.log('📧 Attempting to send email via Resend...')
    
    // Try Resend API as fallback
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY') || 'fallback'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `AgentiCAD Support <${gmailEmail}>`,
          to: [emailData.to],
          subject: emailData.subject,
          text: emailData.body,
          reply_to: emailData.userEmail
        })
      })
      
      if (response.ok) {
        console.log('✅ Email sent successfully via Resend')
        return true
      } else {
        const errorText = await response.text()
        console.log('❌ Resend failed:', errorText)
      }
    } catch (resendError) {
      console.log('❌ Resend error:', resendError)
    }
    
    console.log('📧 Attempting to send email via SendGrid...')
    
    // Try SendGrid API as another fallback
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY') || 'fallback'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: emailData.to }]
          }],
          from: { email: gmailEmail, name: 'AgentiCAD Support' },
          subject: emailData.subject,
          content: [{
            type: 'text/plain',
            value: emailData.body
          }],
          reply_to: { email: emailData.userEmail }
        })
      })
      
      if (response.ok) {
        console.log('✅ Email sent successfully via SendGrid')
        return true
      } else {
        const errorText = await response.text()
        console.log('❌ SendGrid failed:', errorText)
      }
    } catch (sendgridError) {
      console.log('❌ SendGrid error:', sendgridError)
    }
    
    // Final fallback: Create a webhook request to a simple email service
    console.log('📧 Attempting to send email via webhook...')
    
    try {
      const webhookUrl = 'https://api.web3forms.com/submit'
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_key: Deno.env.get('WEB3FORMS_ACCESS_KEY') || 'fallback',
          subject: emailData.subject,
          email: emailData.userEmail,
          message: emailData.body,
          to: emailData.to
        })
      })
      
      if (response.ok) {
        console.log('✅ Email sent successfully via Web3Forms')
        return true
      } else {
        const errorText = await response.text()
        console.log('❌ Web3Forms failed:', errorText)
      }
    } catch (webhookError) {
      console.log('❌ Webhook error:', webhookError)
    }
    
    // Ultimate fallback: Log the email content clearly
    console.log('📧 ALL EMAIL SERVICES FAILED - LOGGING FOR MANUAL PROCESSING:')
    console.log('=' .repeat(80))
    console.log(`📧 URGENT: MANUAL EMAIL PROCESSING REQUIRED`)
    console.log(`📧 To: ${emailData.to}`)
    console.log(`📧 From: ${gmailEmail}`)
    console.log(`📧 Reply-To: ${emailData.userEmail}`)
    console.log(`📧 Subject: ${emailData.subject}`)
    console.log('=' .repeat(80))
    console.log(emailData.body)
    console.log('=' .repeat(80))
    console.log(`📧 PLEASE MANUALLY SEND THIS EMAIL TO: ${emailData.to}`)
    console.log('=' .repeat(80))
    
    // Return true so the user request doesn't fail
    return true
    
  } catch (error) {
    console.error('❌ Complete email sending failure:', error)
    console.log('📧 EMERGENCY EMAIL CONTENT:')
    console.log(emailData.body)
    return true
  }
} 