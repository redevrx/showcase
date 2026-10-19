import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/

const STATUSES = ['online', 'idle', 'dnd', 'offline'] as const
const TONES = ['primary', 'accent', 'live', 'neutral'] as const
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function profilesDir() {
  return join(process.cwd(), 'data', 'profiles')
}

export function profileFile(username: string) {
  return join(profilesDir(), `${username}.json`)
}

export async function readProfile(username: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(profileFile(username), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function writeProfile(username: string, data: Record<string, unknown>) {
  await fs.mkdir(profilesDir(), { recursive: true })
  await fs.writeFile(profileFile(username), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export async function deleteProfile(username: string) {
  await fs.rm(profileFile(username), { force: true })
}

export interface ProfileListItem {
  username: string
  displayName: string
  tagline: string
  status: string
  primary: string
  accent: string
  avatar: string
  updatedAt: number
}

export async function listProfiles(): Promise<ProfileListItem[]> {
  let files: string[] = []
  try {
    files = await fs.readdir(profilesDir())
  } catch {
    return []
  }

  const items: ProfileListItem[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const username = file.slice(0, -'.json'.length)
    try {
      const [raw, stat] = await Promise.all([
        fs.readFile(join(profilesDir(), file), 'utf8'),
        fs.stat(join(profilesDir(), file)),
      ])
      const data = JSON.parse(raw)
      items.push({
        username,
        displayName: String(data.displayName ?? username),
        tagline: String(data.tagline ?? ''),
        status: STATUSES.includes(data.status) ? data.status : 'offline',
        primary: HEX_COLOR.test(data.theme?.primary) ? data.theme.primary : '#CFE6FF',
        accent: HEX_COLOR.test(data.theme?.accent) ? data.theme.accent : '#FFB65C',
        avatar: typeof data.avatar === 'string' ? data.avatar : '',
        updatedAt: stat.mtimeMs,
      })
    } catch {
      // skip malformed files
    }
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt)
}

/* ------------------------------ validation ------------------------------ */

function str(value: unknown, max = 160): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function strictUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? '').trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function strictAudioUrl(value: unknown): string {
  const v = String(value ?? '').trim().slice(0, 300)
  if (/^\/audio\/[a-z0-9][a-z0-9._-]*$/i.test(v)) return v
  return strictUrl(v)
}

function strictSpotifyUrl(value: unknown): string {
  const v = strictUrl(value)
  try {
    const url = new URL(v)
    if (url.hostname !== 'open.spotify.com') return ''
    return /^\/(track|album|playlist|artist|episode)\/[A-Za-z0-9]+/.test(url.pathname) ? v : ''
  } catch {
    return ''
  }
}

function color(value: unknown, fallback: string): string {
  const v = String(value ?? '').trim()
  return HEX_COLOR.test(v) ? v.toLowerCase() : fallback
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function sanitizeProfile(input: unknown): { username: string, profile: Record<string, unknown> } {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile payload' })
  }
  const raw = input as Record<string, any>
  const username = String(raw.username ?? '').toLowerCase().trim()

  if (!USERNAME_RE.test(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid username',
      message: 'username ต้องเป็น a-z, 0-9, - หรือ _ ยาว 2-32 ตัว',
    })
  }

  const status = STATUSES.includes(raw.status) ? raw.status : 'online'
  const badges = Array.isArray(raw.badges)
    ? raw.badges.slice(0, 8).map((b: any) => ({
        label: str(b?.label, 40),
        icon: str(b?.icon, 24),
        tone: TONES.includes(b?.tone) ? b.tone : 'neutral',
      })).filter((b: any) => b.label)
    : []

  const socials = Array.isArray(raw.socials)
    ? raw.socials.slice(0, 12).map((s: any) => ({
        platform: str(s?.platform, 24).toLowerCase(),
        url: strictUrl(s?.url),
        handle: str(s?.handle, 60),
      })).filter((s: any) => s.platform && s.url)
    : []

  const links = Array.isArray(raw.links)
    ? raw.links.slice(0, 16).map((l: any) => ({
        label: str(l?.label, 60),
        url: strictUrl(l?.url),
        icon: str(l?.icon, 24),
        meta: str(l?.meta, 120),
      })).filter((l: any) => l.label && l.url)
    : []

  const nowPlayingRaw = raw.nowPlaying
  const nowPlayingSrc = strictAudioUrl(nowPlayingRaw?.src)
  const nowPlayingSpotify = strictSpotifyUrl(nowPlayingRaw?.spotify)
  const nowPlaying = nowPlayingRaw && typeof nowPlayingRaw === 'object'
    ? {
        playing: !!nowPlayingRaw.playing,
        title: str(nowPlayingRaw.title, 80),
        artist: str(nowPlayingRaw.artist, 80),
        progress: num(nowPlayingRaw.progress, 0, 100, 0),
        bpm: num(nowPlayingRaw.bpm, 40, 200, 110),
        ...(nowPlayingSrc ? { src: nowPlayingSrc } : {}),
        ...(nowPlayingSpotify ? { spotify: nowPlayingSpotify } : {}),
      }
    : undefined

  const statsRaw = raw.stats
  const stats = statsRaw && typeof statsRaw === 'object'
    ? {
        views: num(statsRaw.views, 0, 99_999_999, 0),
        likes: num(statsRaw.likes, 0, 99_999_999, 0),
        since: /^\d{4}$/.test(String(statsRaw.since ?? '')) ? String(statsRaw.since) : String(new Date().getFullYear()),
      }
    : undefined

  const sceneRaw = raw.scene
  const scene = {
    moteCount: num(sceneRaw?.moteCount, 400, 8000, 3200),
    motion: num(sceneRaw?.motion, 0, 1, 1),
  }

  const preset = str(raw.theme?.preset, 24) || 'signal'

  const profile = {
    username,
    template: raw.template === 'skyline' ? 'skyline' : 'prism',
    displayName: str(raw.displayName, 40) || username,
    tagline: str(raw.tagline, 120),
    avatar: strictUrl(raw.avatar) || (typeof raw.avatar === 'string' && raw.avatar.startsWith('/uploads/') ? raw.avatar.slice(0, 200) : ''),
    status,
    badges,
    theme: {
      preset,
      primary: color(raw.theme?.primary, '#CFE6FF'),
      accent: color(raw.theme?.accent, '#FFB65C'),
    },
    ...(stats ? { stats } : {}),
    socials,
    links,
    ...(nowPlaying ? { nowPlaying } : {}),
    scene,
  }

  return { username, profile }
}
