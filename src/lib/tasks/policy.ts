export type Actor = {
  orgId: string
  profileId: string
  isAdmin: boolean
  isActive: boolean
  propertyIds: string[]
  committeeIds: string[]
  operationsCommitteeId: string
}
export type Scope = {
  orgId: string
  propertyId: string | null
  committeeId: string
  assigneeIds: string[]
}
const sameOrg = (a: Actor, t: Scope) => a.isActive && a.orgId === t.orgId
export const canViewTask = (a: Actor, t: Scope) =>
  sameOrg(a, t) &&
  (a.isAdmin ||
    t.assigneeIds.includes(a.profileId) ||
    a.committeeIds.includes(t.committeeId) ||
    (!!t.propertyId && a.propertyIds.includes(t.propertyId)))
export const canEditTask = (a: Actor, t: Scope) =>
  sameOrg(a, t) &&
  (a.isAdmin ||
    t.assigneeIds.includes(a.profileId) ||
    a.committeeIds.includes(t.committeeId))
export const canTransferTask = (a: Actor, t: Scope) =>
  sameOrg(a, t) &&
  (a.isAdmin || a.committeeIds.includes(a.operationsCommitteeId))
export const canReviewTransfer = canTransferTask
export const canDecideTask = (a: Actor, t: Scope) =>
  sameOrg(a, t) && a.committeeIds.includes(t.committeeId)
