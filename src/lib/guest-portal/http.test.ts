import { expect,it } from 'vitest'
import { readBoundedBody,readGuestJson,guestPrivateHeaders } from './http'
it('bounds a chunked body before parsing or trusting Content-Length',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5));controller.enqueue(new Uint8Array(10));controller.close()}})
 await expect(readBoundedBody(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'} as RequestInit),10)).rejects.toMatchObject({status:413})
 await expect(readBoundedBody(new Request('http://localhost',{method:'POST',body:'hello',headers:{'content-length':'100'}}),10)).rejects.toMatchObject({status:413})
})
it('rejects malformed JSON with a safe error and private headers',async()=>{await expect(readGuestJson(new Request('http://localhost',{method:'POST',body:'{secret'}))).rejects.toMatchObject({message:'Invalid request body',status:400});expect(guestPrivateHeaders).toMatchObject({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'})})
