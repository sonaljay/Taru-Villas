import { expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({elapsed:0}))
vi.mock('@/lib/oracle/cron-auth',()=>({isCronAuthorized:()=>true}))
vi.mock('@/lib/guest-portal/upload-store',()=>({cleanGuestUploadDrafts:async()=>0}))
vi.mock('@/lib/guest-portal/email-worker',()=>({enqueueGuestEmails:async()=>{mocks.elapsed+=30000;return{queued:0,held:0}},deliverGuestEmails:async({budgetMs}:{budgetMs:number})=>({accepted:budgetMs>16000?1:0,held:0,failed:0})}))
import { POST } from '@/app/api/cron/guest-portal/route'
it('allows an already-due email to progress even when enqueue consumes thirty seconds',async()=>{const clock=vi.spyOn(Date,'now').mockImplementation(()=>mocks.elapsed);try{const response=await POST(new Request('http://localhost/api/cron/guest-portal'));expect(await response.json()).toMatchObject({deliveries:{accepted:1}})}finally{clock.mockRestore()}})
