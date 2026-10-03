import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, uid } from './lib'
import type { AppData, ChatMessage, Role, Wish, WishComment } from './types'

export interface CloudProfile {
  id: string
  coupleId: string
  role: Role
  displayName: string
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
  const { data: profile } = await retryResult(() => api.from('profiles').select('id,couple_id,role,display_name').eq('id', sessionData.session.user.id).maybeSingle())
  if (!profile?.couple_id || !profile.role) return null
  const { data: couple } = await retryResult(() => api.from('couples').select('invite_code').eq('id', profile.couple_id).single())
  return {
    id: profile.id,
    coupleId: profile.couple_id,
    role: profile.role as Role,
    displayName: profile.display_name,
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
  const { data } = await client().storage.from('couple-media').createSignedUrl(path, 60 * 60)
  return data?.signedUrl
}

export async function fetchCloudData(profile: CloudProfile): Promise<AppData> {
  const api = client()
  const [wishesResult, commentsResult, likesResult, reservationsResult, messagesResult, profilesResult] = await Promise.all([
    retryResult(() => api.from('wishes').select('*').eq('couple_id', profile.coupleId).order('created_at', { ascending: false })),
    retryResult(() => api.from('wish_comments').select('*').order('created_at')),
    retryResult(() => api.from('wish_likes').select('*')),
    profile.role === 'husband' ? retryResult(() => api.from('wish_reservations').select('*')) : Promise.resolve({ data: [] }),
    retryResult(() => api.from('messages').select('*').eq('couple_id', profile.coupleId).order('created_at')),
    retryResult(() => api.from('profiles').select('id,role').eq('couple_id', profile.coupleId)),
  ])
  const roleById = new Map((profilesResult.data || []).map((item: any) => [item.id, item.role as Role]))
  const likedIds = new Set((likesResult.data || []).filter((item: any) => item.user_id === profile.id).map((item: any) => item.wish_id))
  const reservedIds = new Set((reservationsResult.data || []).map((item: any) => item.wish_id))

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
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
    completionNote: row.completion_note || undefined,
    likedByHusband: likedIds.has(row.id),
    reservedByHusband: reservedIds.has(row.id),
  })))
  const comments: WishComment[] = (commentsResult.data || []).map((row: any) => ({ id: row.id, wishId: row.wish_id, author: roleById.get(row.author_id) || 'wife', text: row.text, createdAt: row.created_at }))
  const messages: ChatMessage[] = await Promise.all((messagesResult.data || []).map(async (row: any) => ({ id: row.id, author: roleById.get(row.author_id) || 'wife', text: row.text || undefined, image: await mediaUrl(row.image_path), createdAt: row.created_at, read: true })))
  return { wishes, comments, messages }
}

async function uploadDataUrl(value: string | undefined, profile: CloudProfile, folder: 'wishes' | 'chat') {
  if (!value || !value.startsWith('data:')) return value
  const response = await fetch(value)
  const blob = await response.blob()
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const path = `${profile.coupleId}/${folder}/${uid('media')}.${ext}`
  await retryResult(() => client().storage.from('couple-media').upload(path, blob, { contentType: blob.type, upsert: false }))
  return path
}

export async function insertCloudWish(wish: Wish, profile: CloudProfile) {
  const coverPath = await uploadDataUrl(wish.image, profile, 'wishes')
  await retryResult(() => client().from('wishes').insert({
    id: wish.id, couple_id: profile.coupleId, author_id: profile.id, title: wish.title,
    description: wish.description, source_url: wish.link, price: wish.price, cover_path: coverPath,
    image_paths: coverPath ? [coverPath] : [], categories: wish.categories, stars: wish.stars, details: wish.details,
  }))
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

export function subscribeToCloud(profile: CloudProfile, refresh: () => void): RealtimeChannel {
  return client().channel(`couple:${profile.coupleId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `couple_id=eq.${profile.coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `couple_id=eq.${profile.coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_comments' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_likes' }, refresh)
    .subscribe()
}

export async function signOutCloud() {
  await client().auth.signOut()
}
