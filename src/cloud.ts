import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, uid } from './lib'
import type { AppData, CalendarEvent, ChatMessage, MemberProfile, Role, Wish, WishComment } from './types'

export interface CloudProfile {
  id: string
  coupleId: string
  role: Role
  displayName: string
  avatar?: string
  inviteCode: string
  email?: string
  anonymous?: boolean
}

export type AuthMode = 'login' | 'register'
export type AuthResult = CloudProfile | 'join-required' | 'confirm-required'

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function retryResult(operation: () => PromiseLike<any>, attempts = 3) {
  let lastError: any
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation()
      if (!result.error || result.error.code === '23505') return result
      lastError = result.error
    } catch (error) {
      lastError = error
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  throw lastError || new Error('Не удалось связаться с сервером')
}

export async function restoreProfile(): Promise<CloudProfile | null> {
  const api = client()
  const { data: sessionData } = await api.auth.getSession()
  if (!sessionData.session) return null
  const { data: profile } = await retryResult(() => api.from('profiles').select('id,couple_id,role,display_name,avatar_path').eq('id', sessionData.session.user.id).maybeSingle())
  if (!profile?.couple_id || !profile.role) return null
  const { data: couple } = await retryResult(() => api.from('couples').select('invite_code').eq('id', profile.couple_id).single())
  return {
    id: profile.id,
    coupleId: profile.couple_id,
    role: profile.role as Role,
    displayName: profile.display_name,
    avatar: await mediaUrl(profile.avatar_path),
    inviteCode: couple?.invite_code || '',
    email: sessionData.session.user.email,
    anonymous: sessionData.session.user.is_anonymous,
  }
}

async function ensureAnonymousSession() {
  const api = client()
  const { data } = await api.auth.getSession()
  if (data.session) return data.session
  const { data: signed } = await retryResult(() => api.auth.signInAnonymously())
  if (!signed.session) throw new Error('Не удалось создать вход')
  return signed.session
}

export async function createCloudCouple(role: Role): Promise<CloudProfile | 'join-required'> {
  const api = client()
  const session = await ensureAnonymousSession()
  const existing = await restoreProfile()
  if (existing) return existing
  if (role === 'husband') return 'join-required'
  const { data } = await retryResult(() => api.rpc('create_couple', { member_name: 'Алла', member_role: 'wife' }))
  const row = Array.isArray(data) ? data[0] : data
  return { id: session.user.id, coupleId: row.couple_id, role, displayName: 'Алла', inviteCode: row.invite_code, email: session.user.email, anonymous: session.user.is_anonymous }
}

export async function authenticateCloud(email: string, password: string, role: Role, mode: AuthMode): Promise<AuthResult> {
  const api = client()
  const current = (await api.auth.getSession()).data.session
  if (current?.user.is_anonymous) await api.auth.signOut()
  const result = await retryResult(() => mode === 'register'
    ? api.auth.signUp({ email, password })
    : api.auth.signInWithPassword({ email, password }))
  if (!result.data.session) return 'confirm-required'
  const existing = await restoreProfile()
  if (existing) return existing
  if (role === 'husband') return 'join-required'
  const { data } = await retryResult(() => api.rpc('create_couple', { member_name: 'Алла', member_role: 'wife' }))
  const row = Array.isArray(data) ? data[0] : data
  return {
    id: result.data.session.user.id,
    coupleId: row.couple_id,
    role: 'wife',
    displayName: 'Алла',
    inviteCode: row.invite_code,
    email: result.data.session.user.email,
    anonymous: false,
  }
}

export async function linkCloudAccount(email: string, password: string) {
  const { data } = await retryResult(() => client().auth.updateUser({ email, password }))
  return { email: data.user.email || email, anonymous: data.user.is_anonymous }
}

export async function joinCloudCouple(code: string): Promise<CloudProfile> {
  const api = client()
  const session = await ensureAnonymousSession()
  const { data: coupleId } = await retryResult(() => api.rpc('join_couple', { code, member_name: 'Стас', member_role: 'husband' }))
  const { data: couple } = await retryResult(() => api.from('couples').select('invite_code').eq('id', coupleId).single())
  return { id: session.user.id, coupleId, role: 'husband', displayName: 'Стас', inviteCode: couple?.invite_code || code.toUpperCase(), email: session.user.email, anonymous: session.user.is_anonymous }
}

async function mediaUrl(path?: string | null) {
  if (!path) return undefined
  if (/^(https?:|data:)/.test(path)) return path
  const cacheKey = `our-wishes-media:${path}`
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (cached?.url && cached.expiresAt > Date.now()) return cached.url as string
  } catch { /* create a fresh signed URL */ }
  const { data } = await client().storage.from('couple-media').createSignedUrl(path, 60 * 60 * 24 * 7)
  if (data?.signedUrl) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ url: data.signedUrl, expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000 })) } catch { /* storage can be full */ }
  }
  return data?.signedUrl
}

export async function fetchCloudData(profile: CloudProfile): Promise<AppData> {
  const api = client()
  const [wishesResult, commentsResult, likesResult, reservationsResult, messagesResult, profilesResult, eventsResult, messageLikesResult, wishViewsResult] = await Promise.all([
    retryResult(() => api.from('wishes').select('*').eq('couple_id', profile.coupleId).order('created_at', { ascending: false })),
    retryResult(() => api.from('wish_comments').select('*').order('created_at')),
    retryResult(() => api.from('wish_likes').select('*')),
    profile.role === 'husband' ? retryResult(() => api.from('wish_reservations').select('*')) : Promise.resolve({ data: [] }),
    retryResult(() => api.from('messages').select('*').eq('couple_id', profile.coupleId).order('created_at')),
    retryResult(() => api.from('profiles').select('id,role,display_name,avatar_path').eq('couple_id', profile.coupleId)),
    retryResult(() => api.from('couple_events').select('*').eq('couple_id', profile.coupleId).order('event_date')),
    retryResult(() => api.from('message_likes').select('*')),
    profile.role === 'husband' ? retryResult(() => api.from('wish_views').select('wish_id').eq('user_id', profile.id)) : Promise.resolve({ data: [] }),
  ])
  const profileRows = profilesResult.data || []
  const roleById = new Map(profileRows.map((item: any) => [item.id, item.role as Role]))
  const members: Record<Role, MemberProfile> = { wife: { displayName: 'Алла' }, husband: { displayName: 'Стас' } }
  await Promise.all(profileRows.map(async (item: any) => {
    const memberRole = item.role as Role
    members[memberRole] = { displayName: item.display_name || (memberRole === 'wife' ? 'Алла' : 'Стас'), avatar: await mediaUrl(item.avatar_path) }
  }))
  const likedIds = new Set((likesResult.data || []).filter((item: any) => item.user_id === profile.id).map((item: any) => item.wish_id))
  const reservedIds = new Set((reservationsResult.data || []).map((item: any) => item.wish_id))
  const messageLikeRows = messageLikesResult.data || []
  const viewedWishIds = new Set((wishViewsResult.data || []).map((item: any) => item.wish_id))

  const wishes: Wish[] = await Promise.all((wishesResult.data || []).map(async (row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    link: row.source_url || undefined,
    price: row.price == null ? undefined : Number(row.price),
    image: await mediaUrl(row.cover_path),
    categories: row.categories || [],
    stars: row.stars,
    details: row.details || undefined,
    targetDate: row.target_date || undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
    completionNote: row.completion_note || undefined,
    likedByHusband: likedIds.has(row.id),
    reservedByHusband: reservedIds.has(row.id),
    isNewForHusband: profile.role === 'husband' && !viewedWishIds.has(row.id),
  })))
  const comments: WishComment[] = (commentsResult.data || []).map((row: any) => ({ id: row.id, wishId: row.wish_id, author: roleById.get(row.author_id) || 'wife', text: row.text, createdAt: row.created_at }))
  const messages: ChatMessage[] = await Promise.all((messagesResult.data || []).map(async (row: any) => ({ id: row.id, author: roleById.get(row.author_id) || 'wife', text: row.text || undefined, image: await mediaUrl(row.image_path), createdAt: row.created_at, read: true, likedByMe: messageLikeRows.some((like: any) => like.message_id === row.id && like.user_id === profile.id), likeCount: messageLikeRows.filter((like: any) => like.message_id === row.id).length })))
  const events: CalendarEvent[] = (eventsResult.data || []).map((row: any) => ({ id: row.id, title: row.title, date: row.event_date, time: row.event_time?.slice(0, 5) || undefined, note: row.note || undefined, emojis: row.emojis || [], author: roleById.get(row.author_id) || 'wife', createdAt: row.created_at }))
  return { wishes, comments, messages, events, members }
}

async function uploadDataUrl(value: string | undefined, profile: CloudProfile, folder: 'wishes' | 'chat' | 'profiles') {
  if (!value) return value
  try {
    if (/^https?:/.test(value)) {
      const optimized = await client().functions.invoke('optimize-media', { body: { sourceUrl: value, folder } })
      if (!optimized.error && optimized.data?.path) return optimized.data.path as string
      return value
    }
    if (!value.startsWith('data:')) return value
    const response = await fetch(value)
    const blob = await response.blob()
    const form = new FormData()
    form.append('file', blob, 'photo.jpg')
    form.append('folder', folder)
    const optimized = await client().functions.invoke('optimize-media', { body: form })
    if (!optimized.error && optimized.data?.path) return optimized.data.path as string
  } catch { /* fall through to direct upload */ }
  if (!value.startsWith('data:')) return value
  const response = await fetch(value)
  const blob = await response.blob()
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const path = `${profile.coupleId}/${folder}/${uid('media')}.${ext}`
  await retryResult(() => client().storage.from('couple-media').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false }))
  return path
}

export async function updateCloudProfile(profile: CloudProfile, displayName: string, avatar: string | undefined, imageChanged: boolean) {
  const values: Record<string, unknown> = { display_name: displayName }
  let avatarPath: string | undefined
  if (imageChanged) {
    avatarPath = await uploadDataUrl(avatar, profile, 'profiles')
    values.avatar_path = avatarPath || null
  }
  await retryResult(() => client().from('profiles').update(values).eq('id', profile.id))
  return { displayName, avatar: imageChanged ? await mediaUrl(avatarPath) : avatar }
}

export async function insertCloudWish(wish: Wish, profile: CloudProfile) {
  const coverPath = await uploadDataUrl(wish.image, profile, 'wishes')
  await retryResult(() => client().from('wishes').insert({
    id: wish.id, couple_id: profile.coupleId, author_id: profile.id, title: wish.title,
    description: wish.description, source_url: wish.link, price: wish.price, cover_path: coverPath,
    image_paths: coverPath ? [coverPath] : [], categories: wish.categories, stars: wish.stars, details: wish.details, target_date: wish.targetDate,
  }))
}

export async function updateCloudWish(wish: Wish, profile: CloudProfile, imageChanged: boolean) {
  const values: Record<string, unknown> = {
    title: wish.title, description: wish.description, source_url: wish.link || null, price: wish.price ?? null,
    categories: wish.categories, stars: wish.stars, details: wish.details || null, target_date: wish.targetDate || null,
    updated_at: new Date().toISOString(),
  }
  if (imageChanged) {
    const coverPath = await uploadDataUrl(wish.image, profile, 'wishes')
    values.cover_path = coverPath || null
    values.image_paths = coverPath ? [coverPath] : []
  }
  await retryResult(() => client().from('wishes').update(values).eq('id', wish.id))
}

export async function deleteCloudWish(wishId: string) {
  await retryResult(() => client().from('wishes').delete().eq('id', wishId))
}

export async function markCloudWishSeen(wishId: string, profile: CloudProfile) {
  await retryResult(() => client().from('wish_views').upsert({ wish_id: wishId, user_id: profile.id }, { onConflict: 'wish_id,user_id' }))
}

export async function insertCloudComment(comment: WishComment, profile: CloudProfile) {
  await retryResult(() => client().from('wish_comments').insert({ id: comment.id, wish_id: comment.wishId, author_id: profile.id, text: comment.text }))
}

export async function setCloudLike(wishId: string, liked: boolean, profile: CloudProfile) {
  await retryResult(() => liked
    ? client().from('wish_likes').insert({ wish_id: wishId, user_id: profile.id })
    : client().from('wish_likes').delete().eq('wish_id', wishId).eq('user_id', profile.id))
}

export async function setCloudReservation(wishId: string, selected: boolean, profile: CloudProfile) {
  await retryResult(() => selected
    ? client().from('wish_reservations').insert({ wish_id: wishId, husband_id: profile.id })
    : client().from('wish_reservations').delete().eq('wish_id', wishId))
}

export async function setCloudCompleted(wishId: string, completed: boolean) {
  await retryResult(() => client().rpc('set_wish_completed', { target_wish: wishId, completed }))
}

export async function insertCloudMessage(message: ChatMessage, profile: CloudProfile) {
  const imagePath = await uploadDataUrl(message.image, profile, 'chat')
  await retryResult(() => client().from('messages').insert({ id: message.id, couple_id: profile.coupleId, author_id: profile.id, text: message.text, image_path: imagePath }))
}

export async function setCloudMessageLike(messageId: string, liked: boolean, profile: CloudProfile) {
  await retryResult(() => liked
    ? client().from('message_likes').insert({ message_id: messageId, user_id: profile.id })
    : client().from('message_likes').delete().eq('message_id', messageId).eq('user_id', profile.id))
}

export async function insertCloudEvent(event: CalendarEvent, profile: CloudProfile) {
  await retryResult(() => client().from('couple_events').insert({ id: event.id, couple_id: profile.coupleId, author_id: profile.id, title: event.title, event_date: event.date, event_time: event.time, emojis: event.emojis, note: event.note }))
}

export async function updateCloudEvent(event: CalendarEvent) {
  await retryResult(() => client().from('couple_events').update({ title: event.title, event_date: event.date, event_time: event.time || null, emojis: event.emojis, note: event.note || null, updated_at: new Date().toISOString() }).eq('id', event.id))
}

export async function deleteCloudEvent(eventId: string) {
  await retryResult(() => client().from('couple_events').delete().eq('id', eventId))
}

function base64UrlToBytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function enableCloudPush(profile: CloudProfile) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Уведомления не поддерживаются на этом устройстве')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано')
  const api = client()
  const { data: keyData, error: keyError } = await api.functions.invoke('push-notify', { body: { action: 'vapid-key' } })
  if (keyError || !keyData?.publicKey) throw keyError || new Error('Не удалось получить ключ уведомлений')
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(keyData.publicKey) })
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Браузер не вернул данные подписки')
  await retryResult(() => api.from('push_subscriptions').upsert({ user_id: profile.id, endpoint: json.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth }, { onConflict: 'user_id,endpoint' }))
  return true
}

export async function notifyPartner(kind: 'wish' | 'message', body: string, url: string) {
  const { error } = await client().functions.invoke('push-notify', { body: { action: 'notify', kind, body: body.slice(0, 180), url } })
  if (error) throw error
}

export function subscribeToCloud(profile: CloudProfile, refresh: () => void): RealtimeChannel {
  return client().channel(`couple:${profile.coupleId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `couple_id=eq.${profile.coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `couple_id=eq.${profile.coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_comments' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_likes' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_events', filter: `couple_id=eq.${profile.coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_likes' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_views' }, refresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `couple_id=eq.${profile.coupleId}` }, refresh)
    .subscribe()
}

export async function signOutCloud() {
  await client().auth.signOut()
}
