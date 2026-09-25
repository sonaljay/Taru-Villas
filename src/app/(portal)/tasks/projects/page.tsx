import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/guards'
import { loadActor } from '@/lib/tasks/access'
import { scopedProjects } from '@/lib/tasks/queries'
import { ProjectsLandingClient } from '@/components/tasks/projects-landing-client'
export const dynamic = 'force-dynamic'
export default async function Page() {
  const p = await getProfile()
  if (!p?.isActive) redirect('/login')
  const a = await loadActor(p.id)
  const projects = await scopedProjects(a)
  return <ProjectsLandingClient projects={projects} isAdmin={a.isAdmin} />
}
