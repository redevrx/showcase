export interface ProfileLink {
  label: string
  url: string
  icon?: string
  meta?: string
}

export interface ProfileSocial {
  platform: string
  url: string
  handle?: string
}

export interface ProfileBadge {
  label: string
  icon?: string
  tone?: 'primary' | 'accent' | 'live' | 'neutral'
}

export interface ProfileTheme {
  preset: string
  primary: string
  accent: string
}

export interface ProfileNowPlaying {
  playing: boolean
  title: string
  artist: string
  progress?: number
  bpm?: number
  /** ไฟล์เสียงตรง (mp3/m4a/ogg) — path ในเว็บ เช่น /audio/song.mp3 หรือ URL เต็ม */
  src?: string
  /** ลิงก์ Spotify (track/album/playlist/artist/episode) — ฝังตัวเล่น lazy เมื่อกดเล่น */
  spotify?: string
}

export interface ProfileStats {
  views?: number
  likes?: number
  since?: string
}

export interface ProfileScene {
  moteCount?: number
  motion?: number
}

export interface Profile {
  username: string
  template: 'prism' | 'skyline'
  displayName: string
  tagline: string
  avatar?: string
  status?: 'online' | 'idle' | 'dnd' | 'offline'
  badges: ProfileBadge[]
  theme: ProfileTheme
  stats?: ProfileStats
  socials: ProfileSocial[]
  links: ProfileLink[]
  nowPlaying?: ProfileNowPlaying
  scene?: ProfileScene
}
