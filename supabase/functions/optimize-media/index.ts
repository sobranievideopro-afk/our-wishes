import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@^0'

const wasmResponse = await fetch('https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.44/dist/x86/magick.wasm')
if (!wasmResponse.ok) throw new Error('Image engine failed to load')
await initializeImageMagick(new Uint8Array(await wasmResponse.arrayBuffer()))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function safeRemoteUrl(raw: string) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported image URL')
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) throw new Error('Private address is not allowed')
  return url
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
    const url = Deno.env.get('SUPABASE_URL')!
    const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: userData } = await auth.auth.getUser(token)
    if (!userData.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('couple_id').eq('id', userData.user.id).single()
    if (!profile?.couple_id) throw new Error('Profile not found')

    let folder = 'wishes'
    let blob: Blob
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json()
      folder = String(body.folder || 'wishes')
      const imageResponse = await fetch(safeRemoteUrl(String(body.sourceUrl)), {
        headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!imageResponse.ok) throw new Error(`Image source returned ${imageResponse.status}`)
      blob = await imageResponse.blob()
    } else {
      const form = await request.formData()
      folder = String(form.get('folder') || 'wishes')
      const file = form.get('file')
      if (!(file instanceof Blob)) throw new Error('Image file is required')
      blob = file
    }
    if (!['wishes', 'chat', 'profiles'].includes(folder)) throw new Error('Unsupported folder')
    if (!blob.type.startsWith('image/') || blob.size > 15 * 1024 * 1024) throw new Error('Unsupported image')

    const source = new Uint8Array(await blob.arrayBuffer())
    const optimized = ImageMagick.read(source, (image): Uint8Array => {
      const maxSide = folder === 'profiles' ? 720 : 1400
      if (image.width > maxSide || image.height > maxSide) {
        const ratio = Math.min(maxSide / image.width, maxSide / image.height)
        image.resize(Math.round(image.width * ratio), Math.round(image.height * ratio))
      }
      image.quality = folder === 'profiles' ? 78 : 76
      return image.write(MagickFormat.Jpeg, (data) => data)
    })
    const path = `${profile.couple_id}/${folder}/${crypto.randomUUID()}.jpg`
    const { error } = await admin.storage.from('couple-media').upload(path, optimized, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
    if (error) throw error
    return Response.json({ path, widthLimit: folder === 'profiles' ? 720 : 1400 }, { headers: cors })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Image optimization failed' }, { status: 400, headers: cors })
  }
})
