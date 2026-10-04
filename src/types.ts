export type Role = 'wife' | 'husband'
export type Tab = 'wishes' | 'moodboard' | 'calendar' | 'done' | 'chat' | 'settings'

export type CategoryId =
  | 'everyday' | 'anniversary' | 'new-year' | 'march-8' | 'places'
  | 'travel' | 'car' | 'house' | 'apartment' | 'jewelry'

export interface Wish {
  id: string
  title: string
  description: string
  link?: string
  price?: number
  image?: string
  images?: string[]
  categories: CategoryId[]
  stars: 1 | 2 | 3 | 4 | 5
  details?: string
  targetDate?: string
  createdAt: string
  completedAt?: string
  reservedByHusband?: boolean
  likedByHusband?: boolean
  completionNote?: string
  isNewForHusband?: boolean
  unreadComments?: number
  unreadCommentRoles?: Role[]
}

export interface WishComment {
  id: string
  wishId: string
  author: Role
  text: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  author: Role
  text?: string
  image?: string
  createdAt: string
  read: boolean
  likedByMe?: boolean
  likeCount?: number
}

export interface CalendarEvent {
  id: string
  title: string
  date: string
  time?: string
  note?: string
  emojis: string[]
  color: 'family' | 'work'
  author: Role
  createdAt: string
}

export interface MemberProfile {
  displayName: string
  avatar?: string
}

export interface AppData {
  wishes: Wish[]
  comments: WishComment[]
  messages: ChatMessage[]
  events: CalendarEvent[]
  members: Record<Role, MemberProfile>
}
