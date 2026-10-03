import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const liveBase = 'https://sobranievideopro-afk.github.io/our-wishes/'

async function authenticatedUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data } = await authClient.auth.getUser(token)
  return data.user || null
}

async function applicationServer(admin: ReturnType<typeof createClient>) {
  let { data: config } = await admin.from('push_config').select('*').eq('singleton', true).maybeSingle()
  if (!config) {
    const keys = await webpush.generateVapidKeys({ extractable: true })
    const exported = await webpush.exportVapidKeys(keys)
    const publicKey = await webpush.exportApplicationServerKey(keys)
    const result = await admin.from('push_config').insert({ singleton: true, public_jwk: exported.publicKey, private_jwk: exported.privateKey, application_server_key: publicKey }).select('*').single()
    if (result.error?.code === '23505') config = (await admin.from('push_config').select('*').eq('singleton', true).single()).data
    else if (result.error) throw result.error
    else config = result.data
  }
  const vapidKeys = await webpush.importVapidKeys({ publicKey: config.public_jwk, privateKey: config.private_jwk })
  return {
    publicKey: config.application_server_key as string,
    server: await webpush.ApplicationServer.new({ contactInformation: 'mailto:push@our-wishes.app', vapidKeys }),
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const user = await authenticatedUser(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await request.json()
    const app = await applicationServer(admin)
    if (body.action === 'vapid-key') return Response.json({ publicKey: app.publicKey }, { headers: cors })
    if (body.action !== 'notify' || !['wish', 'message'].includes(body.kind)) return Response.json({ error: 'Unsupported action' }, { status: 400, headers: cors })

    const { data: profile } = await admin.from('profiles').select('couple_id,display_name').eq('id', user.id).single()
    if (!profile?.couple_id) return Response.json({ sent: 0 }, { headers: cors })
    const { data: partners } = await admin.from('profiles').select('id').eq('couple_id', profile.couple_id).neq('id', user.id)
    const partnerIds = (partners || []).map((item) => item.id)
    if (!partnerIds.length) return Response.json({ sent: 0 }, { headers: cors })
    const { data: subscriptions } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', partnerIds)

    const kind = body.kind as 'wish' | 'message'
    const title = kind === 'wish' ? 'Новое желание Аллы 💗' : `${profile.display_name || 'Любимый человек'} написал(а)`
    const destination = typeof body.url === 'string' && body.url.startsWith(liveBase) ? body.url : liveBase
    const payload = JSON.stringify({ title, body: String(body.body || '').slice(0, 180), url: destination, kind })
    const results = await Promise.allSettled((subscriptions || []).map(async (row) => {
      try {
        const subscriber = app.server.subscribe({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })
        await subscriber.pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 86400, topic: kind })
        return true
      } catch (error) {
        if (error instanceof webpush.PushMessageError && error.isGone()) await admin.from('push_subscriptions').delete().eq('id', row.id)
        throw error
      }
    }))
    return Response.json({ sent: results.filter((item) => item.status === 'fulfilled').length }, { headers: cors })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Push failed' }, { status: 500, headers: cors })
  }
})
