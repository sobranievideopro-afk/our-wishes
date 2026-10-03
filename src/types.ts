export type Role = 'wife' | 'husband'
export type Tab = 'wishes' | 'moodboard' | 'done' | 'chat' | 'settings'

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
  createdAt: string
  completedAt?: string
  reservedByHusband?: boolean
  likedByHusband?: boolean
  completionNote?: string
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
}

export interface AppData {
  wishes: Wish[]
  comments: WishComment[]
  messages: ChatMessage[]
}
