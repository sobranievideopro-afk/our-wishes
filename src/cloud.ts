import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, uid } from './lib'
import type { AppData, ChatMessage, Role, Wish, WishComment } from './types'

export interface CloudProfile {
  id: string
  coupleId: string
  role: Role
  displayName: string
  inviteCode: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function restoreProfile(): Promise<CloudProfile | null> {
  const api = client()
  const { data: sessionData } = await api.auth.getSession()
  if (!sessionData.session) return null
  const { data: profile } = await api.from('profiles').select('id,couple_id,role,display_name').eq('id', sessionData.session.user.id).maybeSingle()
  if (!profile?.couple_id || !profile.role) return null
  const { data: couple } = await api.from('couples').select('invite_code').eq('id', profile.couple_id).single()
  return { id: profile.id, coupleId: profile.couple_id, role: profile.role as Role, displayName: profile.display_name, inviteCode: couple?.invite_code || '' }
}

async function ensureAnonymousSession() {
  const api = client()
  const { data } = await api.auth.getSession()
  if (data.session) return data.session
  const { data: signed, error } = await api.auth.signInAnonymously()
  if (error || !signed.session) throw error || new Error('Не удалось создать вход')
  return signed.session
}

export async function createCloudCouple(role: Role): Promise<CloudProfile | 'join-required'> {
  const api = client()
  const session = await ensureAnonymousSession()
  const existing = await restoreProfile()
  if (existing) return existing
  if (role === 'husband') return 'join-required'
  const { data, error } = await api.rpc('create_couple', { member_name: 'Алла', member_role: 'wife' })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { id: session.user.id, coupleId: row.couple_id, role, displayName: 'Алла', inviteCode: row.invite_code }
}

export async function joinCloudCouple(code: string): Promise<CloudProfile> {
  const api = client()
  const session = await ensureAnonymousSession()
  const { data: coupleId, error } = await api.rpc('join_couple', { code, member_name: 'Стас', member_role: 'husband' })
  if (error) throw error
  const { data: couple } = await api.from('couples').select('invite_code').eq('id', coupleId).single()
  return { id: session.user.id, coupleId, role: 'husband', displayName: 'Стас', inviteCode: couple?.invite_code || code.toUpperCase() }
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
    api.from('wishes').select('*').eq('couple_id', profile.coupleId).order('created_at', { ascending: false }),
    api.from('wish_comments').select('*').order('created_at'),
    api.from('wish_likes').select('*'),
    profile.role === 'husband' ? api.from('wish_reservations').select('*') : Promise.resolve({ data: [] }),
    api.from('messages').select('*').eq('couple_id', profile.coupleId).order('created_at'),
    api.from('profiles').select('id,role').eq('couple_id', profile.coupleId),
  ])
  if (wishesResult.error) throw wishesResult.error
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
  const { error } = await client().storage.from('couple-media').upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw error
  return path
}

export async function insertCloudWish(wish: Wish, profile: CloudProfile) {
  const coverPath = await uploadDataUrl(wish.image, profile, 'wishes')
  const { error } = await client().from('wishes').insert({
    id: wish.id, couple_id: profile.coupleId, author_id: profile.id, title: wish.title,
    description: wish.description, source_url: wish.link, price: wish.price, cover_path: coverPath,
    image_paths: coverPath ? [coverPath] : [], categories: wish.categories, stars: wish.stars, details: wish.details,
  })
  if (error) throw error
}

export async function insertCloudComment(wishId: string, text: string, profile: CloudProfile) {
  const { error } = await client().from('wish_comments').insert({ wish_id: wishId, author_id: profile.id, text })
  if (error) throw error
}

export async function setCloudLike(wishId: string, liked: boolean, profile: CloudProfile) {
  const query = liked
    ? client().from('wish_likes').insert({ wish_id: wishId, user_id: profile.id })
    : client().from('wish_likes').delete().eq('wish_id', wishId).eq('user_id', profile.id)
  const { error } = await query
  if (error) throw error
}

export async function setCloudReservation(wishId: string, selected: boolean, profile: CloudProfile) {
  const query = selected
    ? client().from('wish_reservations').insert({ wish_id: wishId, husband_id: profile.id })
    : client().from('wish_reservations').delete().eq('wish_id', wishId)
  const { error } = await query
  if (error) throw error
}

export async function setCloudCompleted(wishId: string, completed: boolean) {
  const { error } = await client().rpc('set_wish_completed', { target_wish: wishId, completed })
  if (error) throw error
}

export async function insertCloudMessage(message: Omit<ChatMessage, 'id' | 'createdAt' | 'read'>, profile: CloudProfile) {
  const imagePath = await uploadDataUrl(message.image, profile, 'chat')
  const { error } = await client().from('messages').insert({ couple_id: profile.coupleId, author_id: profile.id, text: message.text, image_path: imagePath })
  if (error) throw error
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
