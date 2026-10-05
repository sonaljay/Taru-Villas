import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getPropertyByIdForOrganization } from '@/lib/db/queries/properties'
export class OracleAccessError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}
export async function requireLoPropertyAccess(propertyId: string): Promise<{ actorId: string; orgId: string; propertyId: string; oracleHotelId: 'LO' }> {
  const profile = await getProfile()
  if (!profile) throw new OracleAccessError('Unauthorized', 401)
  if (!profile.isActive || (profile.role !== 'admin' && profile.role !== 'property_manager')) throw new OracleAccessError('Forbidden', 403)
  const property = await getPropertyByIdForOrganization(propertyId, profile.orgId)
  if (!property || !property.isActive || property.oracleHotelId !== 'LO') throw new OracleAccessError('Property not found', 404)
  if (profile.role !== 'admin' && !(await getUserProperties(profile.id, profile.role))?.includes(propertyId)) throw new OracleAccessError('Forbidden', 403)
  return { actorId: profile.id, orgId: profile.orgId, propertyId, oracleHotelId: 'LO' }
}
