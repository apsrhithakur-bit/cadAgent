import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatAIRequest {
  provider: 'openai' | 'gemini';
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { provider, messages, temperature = 0.7, maxTokens = 500 } = await req.json() as ChatAIRequest;
    
    // Get Pica credentials from environment
    const picaSecretKey = Deno.env.get('PICA_SECRET_KEY');
    const picaOpenaiConnectionKey = Deno.env.get('PICA_OPENAI_CONNECTION_KEY');
    const picaGeminiConnectionKey = Deno.env.get('PICA_GEMINI_CONNECTION_KEY');
    
    if (!picaSecretKey) {
      throw new Error('Pica secret key not configured');
    }

    let apiResponse: Response;
    let responseData: any;
    
    if (provider === 'openai') {
      if (!picaOpenaiConnectionKey) {
        throw new Error('Pica OpenAI connection key not configured');
      }
      
      console.log('🤖 Calling OpenAI via Pica...');
      
      apiResponse = await fetch('https://api.picaos.com/v1/passthrough/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pica-secret': picaSecretKey,
          'x-pica-connection-key': picaOpenaiConnectionKey,
          'x-pica-action-id': 'conn_mod_def::GDzgi1QfvM4::4OjsWvZhRxmAVuLAuWgfVA'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature,
          max_tokens: maxTokens
        })
      });
      
    } else if (provider === 'gemini') {
      if (!picaGeminiConnectionKey) {
        throw new Error('Pica Gemini connection key not configured');
      }
      
      console.log('🤖 Calling Gemini via Pica...');
      
      // Convert chat messages to Gemini format
      const prompt = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');
      
      // Include system message as context
      const systemMessage = messages.find(msg => msg.role === 'system')?.content || '';
      const fullPrompt = `${systemMessage}\n\n${prompt}`;
      
      apiResponse = await fetch('https://api.picaos.com/v1/passthrough/models/gemini-1.5-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pica-secret': picaSecretKey,
          'x-pica-connection-key': picaGeminiConnectionKey,
          'x-pica-action-id': 'conn_mod_def::GCmd5BQE388::PISTzTbvRSqXx0N0rMa-Lw'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        })
      });
      
    } else {
      throw new Error('Invalid provider. Must be "openai" or "gemini"');
    }

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`${provider} API error: ${apiResponse.status} - ${errorText}`);
    }

    responseData = await apiResponse.json();
    console.log(`✅ ${provider} response received`);

    return new Response(JSON.stringify(responseData), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
    })

  } catch (error) {
    console.error('❌ Chat AI proxy error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        provider: 'unknown'
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