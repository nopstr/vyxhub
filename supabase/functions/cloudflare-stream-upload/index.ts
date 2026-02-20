import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { uploadLength, metadata } = await req.json()

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare credentials not configured')
    }

    // Request a direct upload URL from Cloudflare Stream
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': uploadLength.toString(),
          'Upload-Metadata': metadata,
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Cloudflare API error: ${response.status} ${errorText}`)
    }

    // The upload URL is returned in the Location header
    const uploadUrl = response.headers.get('Location')
    const streamMediaId = response.headers.get('stream-media-id')

    if (!uploadUrl) {
      throw new Error('No upload URL returned from Cloudflare')
    }

    return new Response(
      JSON.stringify({ uploadUrl, streamMediaId }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
