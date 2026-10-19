import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { USERNAME_RE } from '../../utils/profileStore'

const MAX_SIZE = 4 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}
const ALL_EXT = ['png', 'jpg', 'webp', 'gif', 'svg']

export default defineEventHandler(async (event) => {
  const form = await readFormData(event)
  const username = String(form.get('username') ?? '').toLowerCase().trim()

  if (!USERNAME_RE.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid username' })
  }

  const file = form.get('file')
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }

  const blob = file as File
  if (blob.size > MAX_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'ไฟล์ใหญ่เกิน 4MB' })
  }

  let ext = EXT_BY_TYPE[blob.type] ?? ''
  if (!ext) {
    const match = /\.(png|jpe?g|webp|gif|svg)$/i.exec(blob.name ?? '')
    if (match) ext = match[1].toLowerCase().replace('jpeg', 'jpg')
  }
  if (!ext || !ALL_EXT.includes(ext)) {
    throw createError({ statusCode: 415, statusMessage: 'รองรับเฉพาะ png / jpg / webp / gif / svg' })
  }

  const dir = join(process.cwd(), 'public', 'uploads', username)
  await fs.mkdir(dir, { recursive: true })

  await Promise.all(ALL_EXT.map(e => fs.rm(join(dir, `avatar.${e}`), { force: true })))
  const buffer = Buffer.from(await blob.arrayBuffer())
  await fs.writeFile(join(dir, `avatar.${ext}`), buffer)

  return { ok: true, url: `/uploads/${username}/avatar.${ext}` }
})
