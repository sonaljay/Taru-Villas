import { requireAuth } from '@/lib/auth/guards'
import { getProjects } from '@/lib/db/queries/projects'
import { ProjectsLandingClient } from '@/components/tasks/projects-landing-client'

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  searchParams,
}: { searchParams: Promise<{ archived?: string }> }) {
  const profile = await requireAuth()
  if (!profile) return null
  const sp = await searchParams
  const projects = await getProjects(profile.orgId, { includeArchived: sp.archived === '1' })
  return <ProjectsLandingClient projects={projects} isAdmin={profile.role === 'admin'} />
}
