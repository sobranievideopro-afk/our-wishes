import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean)
}

function decode(value?: string) {
  return value?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

function assertSafeUrl(raw: string) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) throw new Error('Private address is not allowed')
  return url
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { url: raw } = await request.json()
    const url = assertSafeUrl(String(raw))
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; OurWishes/1.0)' }, redirect: 'follow', signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`Source returned ${response.status}`)
    const html = (await response.text()).slice(0, 2_000_000)
    const title = decode(meta(html, 'og:title') || meta(html, 'twitter:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1])
    const description = decode(meta(html, 'og:description') || meta(html, 'description'))
    const image = decode(meta(html, 'og:image') || meta(html, 'twitter:image'))
    const priceRaw = meta(html, 'product:price:amount') || meta(html, 'og:price:amount')
    const price = priceRaw ? Number(priceRaw.replace(/[^0-9.,]/g, '').replace(',', '.')) : undefined
    return Response.json({ title, description, image: image ? new URL(image, url).href : undefined, price: Number.isFinite(price) ? price : undefined, link: url.href }, { headers: cors })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 400, headers: cors })
  }
})
