const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function meta(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
  ]
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean)
}

function decode(value?: string) {
  return value?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

function safeUrl(raw: string) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) throw new Error('Private address is not allowed')
  return url
}

function cleanMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseJina(markdown: string, source: URL) {
  const title = cleanMarkdown(markdown.match(/^Title:\s*(.+)$/m)?.[1] || '')
  const content = markdown.split('Markdown Content:')[1] || markdown
  const image = content.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/i)?.[1]
  const priceRaw = content.match(/(?:^|\s)(\d{1,3}(?:[ \u00a0]\d{3})+|\d{3,7})\s*₽/m)?.[1]
  const lines = content.split('\n').map(cleanMarkdown).filter((line) =>
    line.length > 45 &&
    !/^избранное|^авторизация|^корзина|^на главную/i.test(line) &&
    !/^(подробные характеристики|тип продукта|для кого|страна происхождения)/i.test(line)
  )
  return {
    title: title && !/checking device/i.test(title) ? title.replace(/^В наличии:\s*/i, '') : undefined,
    description: lines[0]?.slice(0, 700),
    image,
    price: priceRaw ? Number(priceRaw.replace(/[ \u00a0]/g, '')) : undefined,
    link: source.href,
  }
}

async function fetchJina(url: URL) {
  const response = await fetch(`https://r.jina.ai/${url.href}`, {
    headers: { accept: 'text/plain' },
    signal: AbortSignal.timeout(18_000),
  })
  if (!response.ok) throw new Error(`Reader returned ${response.status}`)
  return parseJina((await response.text()).slice(0, 2_000_000), url)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await request.json()
    const url = safeUrl(String(body.url))
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
      if (url.hostname.endsWith('goldapple.ru')) return Response.json(await fetchJina(url), { headers: cors })
      throw new Error(`Source returned ${response.status}`)
    }
    const html = (await response.text()).slice(0, 2_000_000)
    const title = decode(meta(html, 'og:title') || meta(html, 'twitter:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1])
    const description = decode(meta(html, 'og:description') || meta(html, 'description'))
    const image = decode(meta(html, 'og:image') || meta(html, 'twitter:image'))
    const priceRaw = meta(html, 'product:price:amount') || meta(html, 'og:price:amount')
    const price = priceRaw ? Number(priceRaw.replace(/[^0-9.,]/g, '').replace(',', '.')) : undefined
    if (url.hostname.endsWith('goldapple.ru') && (!title || /checking device/i.test(title))) {
      return Response.json(await fetchJina(url), { headers: cors })
    }
    return Response.json({ title, description, image: image ? new URL(image, url).href : undefined, price: Number.isFinite(price) ? price : undefined, link: url.href }, { headers: cors })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 400, headers: cors })
  }
})
