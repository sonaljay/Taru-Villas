import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] || '').replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })

const TEAMS = ['Operations','Interior','Housekeeping','Culinary','Naturalists','Activities','Engineer','Purchase','Finance','HR','General','MS Creatives','Media','CEO','Marketing']

const MONTHS = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
function parseDeadline(s) {
  if (!s) return null
  const t = s.trim().toLowerCase()
  if (t.startsWith('immed')) return null
  const m = t.match(/^(\d{1,2})\.\s*([a-z]+)/)
  if (!m) return null
  const day = +m[1], mon = MONTHS[m[2]]
  if (!mon) return null
  const year = mon < 6 ? 2027 : 2026 // tracker dated 2026-06-12; earlier months roll forward
  return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}
const STATUS = { 'pending':'todo','in progress':'in_progress','completed':'done' }
function splitTeams(raw) {
  return raw.split(/[\/,&]/).map((x) => x.trim()).filter(Boolean).map((tok) => {
    const hit = TEAMS.find((tm) => tm.toLowerCase() === tok.toLowerCase())
    return hit || tok // unknown tokens kept verbatim; will be created as a team
  })
}

// [title, detail, updates, deadline, responsible, status]
const ROWS = [
  ['BOP Service/F&B','Full Service BOP including Stocktakes, Inventory rotation, Butlers duties, Service, Dietaries','From Scratch - starting at Long House/Rampart Street - first draft to be finalized for review','10. July','Operations','In Progress'],
  ['Styling Guide Service','Styling Guide of all Bar areas; Storage areas; Table Setups;','From Scratch - starting at Long House/Rampart Street','10. July','Interior / Operations','In Progress'],
  ['BOP Housekeeping','Share Room Orientation document to be included into BOP','First draft to be shared with Steph','10. July','Housekeeping','Pending'],
  ['BOP Housekeeping','General BOP for Housekeeping area including all details as per frame work','First draft has been shared, needs a lot of changes and add ons - Steph to share a more detailed review','15. September','Housekeeping','In Progress'],
  ['BOP Collateral','Full Collateral BOP to be worked into the Houskeeping BOP','Senarath to take pictures once implemented and share for overall BOP and Styling','15. September','Housekeeping','In Progress'],
  ['BOP Housekeeping','Share list of how to clean what to be included into BOP','Senarath to share a full list with how to clean what - brass, rugs, windows, ceramic, wood etc.','10. July','Housekeeping','Pending'],
  ['Laundry List','Sort out laundry list as a beautifully designed clipboard / and on QR code','sample idea shared - Purchase to get physical sample to finalize / Senarath to work on finalizing list','10. July','Housekeeping','In Progress'],
  ['Signage Guest Areas','No smoking sign and wet floor sign needs to be replaced - so long taken out of the rooms','sample idea shared - to be signed off in collateral meeting','10. July','Interior','In Progress'],
  ['Collateral','Finalizing all collateral in the room - discussion was held to go with 1 x QR code for everything?','Discussions were had at Long House between Interior, HK and MS Creatives (General) - to be presented and finalized 3-5th July in Colombo','10. July','CEO, Marketing','In Progress'],
  ['Music in Main areas','Create and share playlists for each property','Sabreena to share playlists with Steph for final discussion and implementation','15. September','Interior','Pending'],
  ['Internal Communication','Overall Process for communication of Executive Teams, Property Management and deliverables','Draft to be shared by General and Wathsala; Steph to include into BOP','15. September','HR/General','Pending'],
  ['Phones','Overall BOP for phones in the room and the How to','Memo shared by Alvin & Wathsala - ALL Senior team to implement and Follow up - Steph to include into training and BOP','15. September','General','In Progress'],
  ['Taru Villas Way','Finalize 12 Behaviors - the Taru Way','To be shared as a 1 pager and included in mission training. Steph to share a draft','10. July','MS Creatives','In Progress'],
  ['Budget','FF&E Budget to be reviewed including items for the rooms such as toilet roll covers, rings for','Sabreena to share detailed lists with Alvin for sign off','15. September','Interior','In Progress'],
  ['Standard Setup / Styling Guide','Styling Guide of all Main Areas and Room areas for each Lodge','Already started - Senarath to finish Villu and share for final review - roll out to all other Lodges until September / Steph to share pictures for Rampart and Long House','10. July','Housekeeping','In Progress'],
  ['BOP Kitchen','Chef to review Kitchen BOP, including but not limited to: Dietaries, Hygiene, Food identities, Kitchen Flow, How to cleaning and using, Menu presenting to guests, Do\'s and Don\'ts, Store Rooms (Fridges, Freezers etc.)','Recipe cards are already in Place - make sure there are copies in all Lodges; Send BOP draft to Steph for review and overall completion - please send pictures of Kitchen areas, Store rooms etc. for inserting into BOP - Steph to share some pictures from Long House & Rampart','15. September','Culinary','In Progress'],
  ['Menu Activites','review the bento box menues and general bush menus','Markus and Steph can share some ideas - please specify if you need any more equipment.','31. July','Culinary','In Progress'],
  ['Food Concept Ahangama','Health offerings Ahangama','Markus and Steph to share some ideas of theatrical food concept for Chef to give full feedback and discussions before','31. July','Culinary','In Progress'],
  ['Bush Equipment & Hot Box implementation','For Game Drives & Walks only review of equipment for 2026','Villu & Habarana','31. July','Culinary, Naturalists','Pending'],
  ['BBQ Setups','Review equipment and implement','Start with Kandy and Long House - MS to make suggestion for Villu as per request','31. July','Culinary','In Progress'],
  ['Festive Season Menu','To be planned for all properties','Please share with Markus and Steph','15. August','Culinary','Pending'],
  ['Destination Dining','Share ideas for destination dining for all properties with Markus and Steph','Kandy Royal Feast to be implemented!','30. June','Culinary','In Progress'],
  ['Culinary Photo Shoots','All Properties to be completed urgently','Social Media Team has started with SLH properties - others to follow','30. June','Culinary & Media','In Progress'],
  ['Mawella Croc & Cut','Full Crockery and Cutlery Change for Mawella','Include Outdoor Beach Dinners - we do not need any platforms and over complications on the beach - keep it simple and authentic','31. October','Culinary','Pending'],
  ['2027 Menu Tweaks','Full Menu review and roll out plan for 2027','Steph & Markus can give some feedback until end of August to include 1 x destination dining for each property','30. September','Culinary','Pending'],
  ['Kitchen Hygiene & Safety','Certification for all Lodges to be done','Full Training to be included with the Certifications - start training of Dietaries for now - please share details with Steph for BOP','31. March','Culinary & Operations','Pending'],
  ['BOP Uniform and Behaviors','BOP for General Grooming, Uniform (including pictures) and the Taru Villas Way','Basic reference already in Place - General and Wathsala to review and share with Steph for finalization','15. September','HR','Pending'],
  ['BOP Activities','Basic picnics, Baskets for each activity','Cheat sheets for each Activity - Celine to share a simple format - this will be consolitated into an activities BOP','15. September','Activities','Pending'],
  ['BOP Drivers','Full BOP for Driver\'s, Pick ups, Vehicle standards etc.','From Scratch - Meeting in Colombo Markus & Head of Security with Wathsala','10. July','Operations','Pending'],
  ['BOP Maintenance','Preventative Maintenance BOP; Purchasing Process; Manager\'s full review on "how to"','Engineer to share details with Steph for first draft - Hasitha please share','10. July','Engineer','Pending'],
  ['BOP Taru Villas Managers','Job description, Administration, Do\'s and Don\'ts, Check in, Daily/Weekly/Monthly','Wathsala please share current Job discription for Property Managers // Senarath to share property walk about document // Steph to share Orientation - draft for review to be completed before MS is leaving','10. July','MS Creatives','Pending'],
  ['Coffee Quality','Servicing of Machines and Coffee Training / take the plunger out of the room','Start with Long House and Rampart','10. July','MS Creatives','Pending'],
  ['Buyer\'s Guide','Full list (in new system) including all area details in terms of purchase','Send list to Steph with all details to review - priority on Linen / quality needs to be signed off by culinary, operations, MS Creatives','15. September','Purchase','Pending'],
  ['Asset Registers','Full Asset register for each Lodge including suppliers; pictures and re-ordering details','Long House started and to be completed; Rampart started and to be completed','15. September','Finance','Pending'],
  ['Crockery & Cutlery inventory','Full Stock take of','Only Rampart & Long House','10. July','Purchase','Pending'],
  ['OS&E Inventory','Full Stock take of','Only Rampart & Long House','10. July','Purchase','Pending'],
  ['Linen Inventory','Full Stock take of','Only Rampart & Long House','10. July','Purchase','Pending'],
  ['Broken Items','Remove all broken items and clear out store rooms','Long House has been done, take pictures to keep it that way','10. July','Engineer','Pending'],
  ['Capex Plan','Washing Machines, Ovens, AC\'s, Boats, Vehicles, Watersystems, Energy Systems','Rotational 5 Years Capex plannning for all Assets / include Interiors/Machinery etc.','15. September','Engineer','Pending'],
  ['HR Toolkit','Full kit of HR templates for managers on how to deal with: Disciplinary, Staff Performance,','draft has been shared with Steph for review','15. September','HR','In Progress'],
  ['Training Forms','Simple training forms for documentation','has been shared - all Senior team to start recording and shareing with HR immediately','Immediate','HR','Completed'],
  ['Support Team Travels','Travelling document: When are they travelling, Why, Things to be achieved - have they been','Create accountablility document for Senior Teams travel','Immediate','HR','Pending'],
  ['Spare Part list Property','List of Par stock of important items that need to be kept in stock at the Office for potential','e.g. 1 Washing machine, 1 x blender, 1 x Grinder etc.','Immediate','Interior/Engineer','In Progress'],
  ['BOP - Email etiquette','Email etiquette BOP','Draft has been shared with Alvin/Wathsala','10. July','HR','In Progress'],
  ['Recognition Program','Plan for recognition program 2027','MS Creatives to share a basic draft for review, monthly per property, overall for the year (look at criteria)','31. August','MS Creatives','Pending'],
  ['Ice Tea Bar - Long House','Re-style and implement the Ice Tea Bar Concept at Long House','Steph has shared the blends, Sabreena to share style of jars - implementation 24th June','10. July','Interior/MS Creatives','In Progress'],
  ['Key staff identification','Train the Trainer / Hospitality Champion','MS Creatives to share with HR','10. July','MS Creatives','Pending'],
]

const [{ id: orgId }] = await sql`select id from organizations order by created_at asc limit 1`
const [{ id: adminId }] = await sql`select id from profiles where role='admin' and org_id=${orgId} order by created_at asc limit 1`

// upsert teams
const teamId = {}
for (let i = 0; i < TEAMS.length; i++) {
  const [row] = await sql`
    insert into task_teams (org_id, name, sort_order) values (${orgId}, ${TEAMS[i]}, ${i})
    on conflict (org_id, name) do update set sort_order = excluded.sort_order
    returning id, name`
  teamId[row.name] = row.id
}
async function ensureTeam(name) {
  if (teamId[name]) return teamId[name]
  const [row] = await sql`insert into task_teams (org_id, name, sort_order) values (${orgId}, ${name}, 99)
    on conflict (org_id, name) do update set name=excluded.name returning id, name`
  teamId[name] = row.id; return row.id
}

let inserted = 0
for (const [title, detail, updates, deadline, responsible, status] of ROWS) {
  const description = detail + (updates ? `\n\nUpdates: ${updates}` : '')
  const [task] = await sql`
    insert into tasks (org_id, title, description, status, priority, due_date, created_by)
    values (${orgId}, ${title}, ${description}, ${STATUS[status.toLowerCase()] || 'todo'}, 'medium',
            ${parseDeadline(deadline)}, ${adminId})
    returning id`
  for (const tn of splitTeams(responsible)) {
    const tid = await ensureTeam(tn)
    await sql`insert into task_team_links (task_id, team_id) values (${task.id}, ${tid}) on conflict do nothing`
  }
  inserted++
}
console.log(`Seeded ${inserted} tasks; ${Object.keys(teamId).length} teams.`)
await sql.end()
