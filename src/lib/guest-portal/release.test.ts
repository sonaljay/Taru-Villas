import { expect,it } from 'vitest'
import { getClientModuleRequestStatus,moduleForPath } from '@/lib/client-release/modules'
it('gates guest pages and APIs before their public authentication exemption',()=>{for(const path of ['/stay/token','/api/guest-portal/token/questionnaire','/api/guest-portal/token/uploads']){expect(moduleForPath(path)).toBe('guest-portal');expect(getClientModuleRequestStatus(path,'guest-profiles',true)).toBe(404);expect(getClientModuleRequestStatus(path,'guest-profiles,guest-portal',true)).toBeNull()}})
