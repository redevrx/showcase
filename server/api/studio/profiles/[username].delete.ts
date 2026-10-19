import { USERNAME_RE, deleteProfile } from '../../../utils/profileStore'

export default defineEventHandler(async (event) => {
  const username = (getRouterParam(event, 'username') ?? '').toLowerCase()
  if (!USERNAME_RE.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid username' })
  }
  await deleteProfile(username)
  return { ok: true }
})
