import { sanitizeProfile, writeProfile } from '../../utils/profileStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, profile } = sanitizeProfile(body?.profile ?? body)
  await writeProfile(username, profile)
  setHeader(event, 'Cache-Control', 'no-store')
  return { ok: true, path: `/p/${username}` }
})
