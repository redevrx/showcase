import { listProfiles } from '../../../utils/profileStore'

export default defineEventHandler(async () => {
  const profiles = await listProfiles()
  return { profiles }
})
