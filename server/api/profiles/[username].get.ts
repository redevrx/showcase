import { USERNAME_RE, readProfile } from '../../utils/profileStore'

export default defineEventHandler(async (event) => {
  const username = (getRouterParam(event, 'username') ?? '').toLowerCase()

  if (!USERNAME_RE.test(username)) {
    throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  }

  const profile = await readProfile(username)
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  }

  setHeader(event, 'Cache-Control', 'no-cache')
  return profile
})
