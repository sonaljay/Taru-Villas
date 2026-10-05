import postgres from 'postgres'
import { createServer } from 'node:http'
import { createCipheriv,createHash,randomBytes,randomUUID } from 'node:crypto'
import { mkdirSync,writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
const url=process.env.LO_TEST_DATABASE_URL
if(!url)throw Error('Set the disposable LO_TEST_DATABASE_URL')
const parsed=new URL(url)
if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.port!=='55447'||parsed.pathname!=='/taru_lo'||parsed.search||parsed.hash)throw Error('Disposable loopback LO database only')
const command=process.argv[2]??'start'
if(!['start','cancel','expire','in-house','disable-catalogue','restore'].includes(command))throw Error('Unknown fixture command')
const scratch='/private/tmp/taru-lo-guest-acceptance';mkdirSync(scratch,{recursive:true})
const sql=postgres(url,{prepare:false,onnotice:()=>{}})
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Colombo'})
const addDays=n=>new Date(Date.parse(`${today}T00:00:00Z`)+n*86400000).toISOString().slice(0,10)
const arrival=addDays(3),departure=addDays(7),expiry=new Date(`${departure}T23:59:59.999+05:30`)

const org='00000000-0000-4000-8000-000000000011',property='00000000-0000-4000-8000-000000000061'
if(command!=='start'){
 if(command==='cancel')await sql`update guest_profiles set stay_state='cancelled' where property_id=${property}`
 if(command==='in-house')await sql`update guest_profiles set stay_state='in_house' where property_id=${property}`
 if(command==='expire')await sql`update guest_portal_access set expires_at=now()-interval '1 second' where property_id=${property}`
 if(command==='disable-catalogue')await sql`update excursions set is_active=false where property_id=${property}`
 if(command==='restore'){await sql`update guest_profiles set stay_state='reserved' where property_id=${property}`;await sql`update guest_portal_access set expires_at=${expiry} where property_id=${property}`;await sql`update excursions set is_active=true where property_id=${property}`}
 await sql.end();process.stdout.write(`Synthetic fixture ${command} applied\n`);process.exit(0)
}
await sql`delete from properties where id=${property}`
await sql`insert into properties(id,org_id,name,slug,code,oracle_hotel_id,location) values(${property},${org},'The Long House · Fixture','browser-lo-fixture','BROWSER-LO','LO','Bentota')`
const [run]=await sql`insert into oracle_sync_runs(org_id,property_id,from_date,to_date,state,phase,completed_at) values(${org},${property},${today},${addDays(365)},'complete','publish',now()) returning id`
const [guest]=await sql`insert into guest_profiles(org_id,property_id,oracle_reservation_id,guest_name,guest_email,arrival_date,departure_date,stay_state,room_type,token,last_synced_run_id,last_pulled_at) values(${org},${property},'browser-guest','Alexandra','fixture@example.invalid',${arrival},${departure},'reserved','Deluxe Room',${randomUUID()},${run.id},now()) returning id`
const token=randomBytes(32).toString('base64url'),id=randomUUID(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.alloc(32,9),iv);cipher.setAAD(Buffer.from(`${id}:1`));const encrypted=Buffer.concat([cipher.update(token),cipher.final()]);const ciphertext=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url')
await sql`insert into guest_portal_access(id,org_id,property_id,guest_profile_id,token_hash,encrypted_token,version,expires_at) values(${id},${org},${property},${guest.id},${createHash('sha256').update(token).digest('hex')},${ciphertext},1,${expiry})`
for(const [prompt,type,options,required] of [['Transport','single_choice',['Car','Train'],true],['Arrival time','time',[],true],['Dietary notes','long_text',[],false],['Travel document','file',[],true]])await sql`insert into pre_arrival_questions(org_id,property_id,prompt,type,options,required,sort_order) values(${org},${property},${prompt},${type},${options},${required},${type==='single_choice'?0:type==='time'?1:type==='long_text'?2:3})`
const actor='00000000-0000-4000-8000-000000000062'
await sql`insert into auth.users(id) values(${actor}) on conflict do nothing`
await sql`insert into profiles(id,org_id,email,full_name,role) values(${actor},${org},'staff-fixture@example.invalid','Local Staff Fixture','admin') on conflict(id) do nothing`
const [menu]=await sql`insert into menus(property_id,type,name,price_note) values(${property},'a_la_carte','At our table','Prices in LKR') returning id`
const [category]=await sql`insert into menu_categories(property_id,menu_id,name) values(${property},${menu.id},'From the kitchen') returning id`
await sql`insert into menu_items(category_id,title,description,price) values(${category.id},'Garden vegetable curry','A warmly spiced curry with rice.','LKR 2,400')`
await sql`insert into excursions(property_id,title,description,price,duration) values(${property},'Along the river','A quiet morning exploring local waterways.','From LKR 5,000','2 hours')`
await sql.end();writeFileSync(`${scratch}/manifest.json`,JSON.stringify({origin:'http://127.0.0.1:3107',url:`http://127.0.0.1:3107/stay/${token}`,propertyId:property,guestProfileId:guest.id},null,2))
writeFileSync(`${scratch}/synthetic.pdf`,'%PDF-1.7\nSynthetic fixture only.\n');writeFileSync(`${scratch}/invalid.png`,'not a png')
const objects=new Map()
const user={id:'00000000-0000-4000-8000-000000000062',aud:'authenticated',role:'authenticated',email:'staff-fixture@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:new Date().toISOString()}
const accessToken=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated'})).toString('base64url'),'fixture-only-signature'].join('.')
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://127.0.0.1:3318').pathname;const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3107');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}if(path==='/auth/v1/token'&&req.method==='POST'){const input=JSON.parse(body.toString());if(input.email!=='staff-fixture@example.invalid'||input.password!=='fixture-password'){res.statusCode=400;res.end(JSON.stringify({msg:'Fixture credentials required'}));return}res.setHeader('content-type','application/json');res.end(JSON.stringify({access_token:accessToken,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}));return}if(path==='/auth/v1/user'){res.setHeader('content-type','application/json');res.end(JSON.stringify(user));return}res.setHeader('content-type','application/json');if(req.method==='POST'&&path.startsWith('/storage/v1/object/pre-arrival/')){objects.set(path.slice('/storage/v1/object/'.length),{bytes:body,mime:req.headers['content-type']});res.end(JSON.stringify({Key:path,Id:randomUUID()}));return}if(req.method==='POST'&&path.startsWith('/storage/v1/object/sign/')){res.end(JSON.stringify({signedURL:`/object/sign/${path.slice('/storage/v1/object/sign/'.length)}?token=fixture`}));return}if(req.method==='DELETE'&&path==='/storage/v1/object/pre-arrival'){for(const prefix of JSON.parse(body.toString()).prefixes??[])objects.delete(`pre-arrival/${prefix}`);res.end('[]');return}if(req.method==='GET'&&path.startsWith('/storage/v1/object/sign/')){const object=objects.get(path.slice('/storage/v1/object/sign/'.length));if(object){res.setHeader('content-type',object.mime);res.end(object.bytes);return}}res.statusCode=404;res.end(JSON.stringify({error:'Fixture route unavailable'}))})
await new Promise(resolve=>server.listen(3318,'127.0.0.1',resolve))
const fixtureEnv={...process.env,NODE_ENV:'development',VERCEL_ENV:'preview',POSTGRES_URL:url,DATABASE_URL:url,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3318',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-only',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GUEST_PORTAL_LINK_KEY:Buffer.alloc(32,9).toString('base64'),GUEST_PORTAL_ORIGIN:'http://127.0.0.1:3107',GUEST_EMAIL_ENABLED:'false',RESEND_API_KEY:'fixture-only',GUEST_EMAIL_FROM:'Fixture <fixture@example.invalid>',CLIENT_INVITE_ONLY:'true',CLIENT_SUPABASE_PUBLIC_SIGNUPS_DISABLED:'true',DEV_BYPASS_AUTH:'false',CRON_SECRET:'fixture-cron-only',ORACLE_OHIP_CLIENT_ID:'',ORACLE_OHIP_CLIENT_SECRET:'',ORACLE_OHIP_APP_KEY:''}
const child=spawn('npm',['run','dev','--','--hostname','127.0.0.1','--port','3107'],{stdio:'inherit',env:fixtureEnv})
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'))
child.on('exit',code=>{server.close();process.exit(code??0)})
process.stdout.write(`Synthetic acceptance manifest: ${scratch}/manifest.json\n`)

