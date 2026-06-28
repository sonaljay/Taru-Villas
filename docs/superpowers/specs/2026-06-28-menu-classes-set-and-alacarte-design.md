# Menu Classes: Set Menu + Seven to Seven (À la carte)

**Date:** 2026-06-28
**Status:** Approved (design) — pending spec review
**Author:** Engineering

## 1. Problem & Goal

Today the menu feature is a single **flat** list per property: `menu_categories`
(sections) → `menu_items`, rendered on one public page (`/m/[slug]`) and managed on
one admin page (`/properties/[id]/menus`).

The business needs **two classes of menu per property**:

1. **Set Menu** — a fixed prix-fixe, with **7 day-specific variants** (one per day of
   the week). The public page must automatically surface the correct menu for *today*,
   while letting guests browse the other days.
2. **Seven to Seven** — the à la carte menu.

First deliverable: ship the model + seed **The Long House** with its 7 set menus and its
Seven to Seven menu (no images for any menu for now), plus the public and admin UI to
view/manage the two classes.

## 2. Scope

In scope (this pass):
- Schema migration introducing a parent `menus` table above categories.
- Queries + API for menu CRUD and nested public/admin reads.
- Public page rebuild: selection screen → Set Menu (today, browsable) / Seven to Seven.
- Admin page rebuild: class switcher → Set Menu (per-day) / Seven to Seven CRUD.
- Seed script for The Long House (idempotent, wipe-and-replace that property's menus).

Out of scope (deferred):
- Images on menu items (explicitly none for now).
- Per-day set menus for properties other than The Long House.
- Date-range / seasonal scheduling of set menus beyond day-of-week.

## 3. Data Model

### 3.1 New table `menus` (parent grouping)

```
menus
  id            uuid pk default gen_random_uuid()
  property_id   uuid NOT NULL → properties.id ON DELETE CASCADE
  type          text NOT NULL            -- CHECK (type IN ('set','a_la_carte'))
  day_of_week   integer NULL             -- 0=Sun … 6=Sat; only for type='set'
  name          text NOT NULL            -- "Monday" … "Sunday" | "Seven to Seven"
  description   text NULL                -- intro blurb (set menus)
  price_note    text NULL                -- "$40 per person"
  footer_note   text NULL               -- inclusions + tax line
  sort_order    integer NOT NULL default 0
  is_active     boolean NOT NULL default true
  created_at    timestamptz NOT NULL default now()
  updated_at    timestamptz NOT NULL default now()
```

Constraints / indexes:
- `CHECK (type IN ('set','a_la_carte'))` (text+CHECK, matching the OTA `source` pattern —
  not a pg enum, to keep the hand-written migration simple).
- `CHECK (type = 'a_la_carte' OR day_of_week BETWEEN 0 AND 6)` — set menus must carry a day.
- Partial unique index `ux_menus_set_day` on `(property_id, day_of_week) WHERE type='set'`
  — one set menu per day per property.
- Index on `(property_id)`.

### 3.2 `menu_categories` — add two columns

```
+ menu_id     uuid → menus.id ON DELETE CASCADE
+ price_note  text NULL        -- section-level price, e.g. Chef's Special "$25 per person"
```

- `property_id` is **kept** (denormalized). It still equals the parent menu's property and
  preserves the existing property-scoped access checks in the categories API without a join.
- `menu_id` is added nullable, backfilled, then set `NOT NULL` (see §3.4).

### 3.3 `menu_items` — unchanged

`title`, `description`, `image_url` (unused for now), `price`, `tags[]`, `sort_order`,
`is_active`. Vegetarian dishes marked `(V)` in source become a `'Vegetarian'` tag (already
rendered emerald by `traditional-menu-layout.tsx`); the `(V)` suffix is stripped from titles.

### 3.4 Migration (`drizzle/0021_menu_classes.sql`)

Hand-written, idempotent, applied to Supabase **before** merge (per project migration
workflow). Order:

1. `CREATE TABLE IF NOT EXISTS menus (...)` + constraints/indexes.
2. `ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS menu_id uuid`,
   `... ADD COLUMN IF NOT EXISTS price_note text`.
3. **Backfill**: for each distinct `property_id` in `menu_categories` with `menu_id IS NULL`,
   insert one `a_la_carte` menu (`name='Menu'`) and set those categories' `menu_id`.
   (Only property `906` has 1 stray category today — safely absorbed.)
4. `ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_menu_id_fk FOREIGN KEY ...`
   and `ALTER COLUMN menu_id SET NOT NULL`.

The Drizzle TS schema in `src/lib/db/schema.ts` is updated to match (manual-apply workflow;
`drizzle-kit` history is known-broken).

## 4. Queries (`src/lib/db/queries/menus.ts`)

New / changed:
- `type MenuWithCategories = Menu & { categories: MenuCategoryWithItems[] }`
- `getMenusForProperty(propertyId)` — all menus for a property (admin), ordered by
  `type`, `day_of_week`, `sort_order`.
- `getSetMenusForProperty(propertyId)` — 7 active set menus, each nested with **active**
  categories + active items, ordered by `day_of_week`. (Public.)
- `getALaCarteMenuForProperty(propertyId)` — the active `a_la_carte` menu nested with active
  categories + items. (Public.)
- `getMenuById(id)`, `createMenu`, `updateMenu`, `deleteMenu` — all mutations `.returning()`.
- Category/item CRUD: `createMenuCategory` now requires `menuId`; reads scope by `menuId`.
- Existing `getMenuCategoriesForProperty` / `getActiveMenuForProperty` are replaced by the
  menu-aware functions; their two call sites (admin page, public page, categories GET) are
  updated.

Nested fetches follow the existing two-query + in-memory grouping pattern (no N+1).

## 5. API

- `POST /api/menus`, `GET /api/menus?propertyId=` — create/list menus (admin/PM, property
  access-checked; staff forbidden, mirroring categories route).
- `PATCH /api/menus/[id]`, `DELETE /api/menus/[id]` — update/delete a menu (cascade removes
  its categories + items).
- `POST /api/menus/categories` — body now includes `menuId` (uuid, required) alongside the
  existing `propertyId`; access check unchanged. Add optional `priceNote`.
- `PATCH /api/menus/categories/[id]` — accept `priceNote`.
- Item routes unchanged.

Zod: plain `z.string()` (no strict `.url()`); coerce nullable `tags` → `[]` before Drizzle.

## 6. Public Page (`/m/[slug]`)

`export const dynamic = 'force-dynamic'` (so "today" is correct per request).

Server page fetches `property`, `setMenus`, `aLaCarteMenu`, and computes
`todayDow` = current day-of-week in **Asia/Colombo** (`Intl.DateTimeFormat` with
`timeZone: 'Asia/Colombo'`). Passes all to a rebuilt `MenusPublicPage` client component.

UX flow:
1. **Selection screen** (default): hero + two large cards — **Set Menu** and
   **Seven to Seven** — each shown only if that class has content.
2. **Set Menu view**: Su–Sa day switcher defaulted to `todayDow` (today badged "Tonight").
   Renders the selected day's `price_note`, intro `description`, its sections (Starter &
   Soup, Mains, Dessert, Chef's Special) using the existing traditional text layout, each
   section's `price_note` when present, and the `footer_note`.
3. **Seven to Seven view**: renders the à la carte sections via the existing
   `TraditionalMenuLayout`.
4. A back / class-switch control returns to the selection screen.

Empty-state: if neither class has active content, show the existing "Menu coming soon".
The existing card-grid (image) layout is retained as a fallback only if items ever have
images; with no images, everything uses the traditional layout.

## 7. Admin Page (`/properties/[id]/menus`)

Rebuilt `MenusPageClient`. Server page passes `getMenusForProperty(propertyId)` plus the
property.

- **Class switcher**: "Set Menu" / "Seven to Seven".
- **Set Menu**: Mon–Sun day selector. If the selected day's menu is missing, a "Create set
  menu for {day}" action seeds an empty `set` menu for that `day_of_week`. When present:
  edit menu-meta (name, `price_note`, intro `description`, `footer_note`) and full
  section/item CRUD under it.
- **Seven to Seven**: auto-create the single `a_la_carte` menu on first visit if missing;
  edit its meta + section/item CRUD.
- Reuses `MenuCategoryForm` (now takes `menuId` + optional `priceNote`), `MenuItemForm`,
  `MenuItemCard`, and the create/edit/delete dialog + alert patterns already in the file.
- Cover image input retained (property-level `menuCoverImageUrl`).

## 8. Seed — The Long House

`property_id = 5351150a-080b-446b-a9d5-a2cb93109332` (`slug=the-long-house`).
A Node script (run with `POSTGRES_URL` from `.env.local`, per the manual-apply workflow)
that is **idempotent**: deletes existing menus for this property (cascade clears
categories/items), then inserts fresh.

Shared set-menu copy:
- `description` (intro): *"At The Long House, our food reflects the Southern coastline —
  bold, vibrant, and rooted in tradition… a refined yet authentic taste of Sri Lanka's
  Southern heritage. These are today's set menu selections. Should you wish to order à la
  carte, our Seven to Seven menu is available as well."*
- `price_note`: `"$40 per person"`.
- `footer_note`: *"Includes a selection of tea, coffee & petit fours. All prices are
  inclusive of government taxes & service charges."*

Each day's sections: **Starter & Soup**, **Mains**, **Dessert**, **Chef's Special**
(`price_note "$25 per person"`). "Tonight's Signature Taste Refresher" is appended as the
last Starter & Soup item (a chef's seasonal palate cleanser). "Seasonal Fruit Platter" is
the last Dessert item.

Per-day dishes (transcribed from `Taru Villas Set Menu.pdf`):

**Monday** (dow=1)
- *Starter & Soup*: Prawn Squid Salad (mint, coriander, coconut, peanut, pomegranate &
  tamarind sauce); Roasted Carrot Soup (V) (garlic bread, crème fraiche & basil leaf).
- *Mains*: Asian Herb Crust Baked Barramundi; Pumpkin Gnocchi (V); Pork Skewer; Baked
  Mediterranean Chicken.
- *Dessert*: Coconut & Passion Fruit Crème Brûlée; Baked Alaska.
- *Chef's Special* — **Rice & Curry** (choose rice: White/Red; fresh side: Mallum/Ruhunu
  Achcharu; main curry below — served with four vegetable curries, papadam, fried dry chili
  & pickle): Black Pork · Ceylonese Red Chicken · Spicy Lagoon Prawn · Fish Ambulthiyal ·
  Beef · Cashew Nut.

**Tuesday** (dow=2)
- *Starter & Soup*: Grilled Coriander Seafood; Cream of Cauliflower Soup (V); Chicken
  Croquettes.
- *Mains*: Pan-Fried Barramundi; Miso Glazed Tofu (V); Pork Piccata.
- *Dessert*: Chocolate Banana Tart; Coconut Panna Cotta.
- *Chef's Special* — **Sri Lankan Kottu Roti** (chopped godamba roti stir-fried with veg &
  onions; please select one): Roast Chicken Kottu; + specialty meats Hot Butter Cuttlefish,
  Deviled Beef, Pork Stew.

**Wednesday** (dow=3)
- *Starter & Soup*: Asian Crispy Squid; French Onion Soup; Fried Lentil Fritters (V).
- *Mains*: Stir Fried Seafood & Cashew Nut; Linguine Tomato Cream (V); Slow-Cooked Curried
  Beef Stew Pie.
- *Dessert*: Warm Chocolate Fondant; Mango Crumble.
- *Chef's Special* — **String Hopper Pilau** (tempered string hoppers with veg, spices &
  coconut gravy; please select one): Mustard Fish or Prawn Curry; Deviled Crab; Black
  Chicken or Pork Curry.

**Thursday** (dow=4)
- *Starter & Soup*: Beer Battered Fish; Vegetable Minestrone Soup (V); Thai Beef Salad.
- *Mains*: Fried Crispy Prawns; Vegetable Lasagna (V); Mushroom Stuffed Chicken.
- *Dessert*: Lime Curd Meringue Tart; Tres Leches Cake.
- *Chef's Special* — **Sri Lankan Kottu Roti** (same as Tuesday).

**Friday** (dow=5)
- *Starter & Soup*: Asian Salad Niçoise; Curried Pumpkin Soup (V); Herb Crusted Beef
  Carpaccio.
- *Mains*: Grilled Garlic Prawn; String Hopper Pilaf (V); Sri Lankan Pan Fried Kottu Roti
  (chicken/beef/pork/vegetable).
- *Dessert*: Coconut & Sago Pearls; Fried Churros.
- *Chef's Special* — **Rice & Curry** (same as Monday).

**Saturday** (dow=6)
- *Starter & Soup*: Seafood Laksa; BBQ Tofu Salad (V); Pork Pineapple Salad.
- *Mains*: Seafood Kabsa Rice; Spinach & Cream Cheese Ravioli (V); Mountain of Meat Pizza.
- *Dessert*: Pumpkin Custard Cake; Poached Pineapple Spiced Syrup.
- *Chef's Special* — **String Hopper Pilau** (same as Wednesday).

**Sunday** (dow=0)
- *Starter & Soup*: Fish Tikka; Pakora Platter (V); Creamy Leek & Chicken Soup.
- *Mains*: Seafood Pasta; Paneer Makhani (V); Masala Mutton Biryani.
- *Dessert*: Watalappam; Baked Alaska.
- *Chef's Special* — **Rice & Curry** (same as Monday).

### 8.1 Seven to Seven (à la carte) — `Taru Villas Temp Menus.pdf`

One `a_la_carte` menu `name='Seven to Seven'`, `footer_note` = *"Prices are inclusive of
service charge & applicable taxes."*, prices stored on each item as `"USD <n>"`. Sections
(in PDF order), each item carries its component description:

- **All Day Breakfast** — Pastry & Bakery Basket; Fresh Juice; Seasonal Fruit Platter /
  Herbal Porridge; Ceylon Tea / Coffee; Breakfast Power Bowl; Coconut Cashew Nut Granola;
  Kurakkan Banana Pancakes / Coconut Waffles / French Toast; Egg Hopper Benedict; Full
  English.
- **Truly Sri Lankan** *(pre-order the night before)* — Coconut Roti; String Hoppers; Green
  Gram Kiri Bath Bowl; Coconut Pittu — each with "Truly Sri Lankan Extras" add-on note
  (Red Chicken / Black Pork / Beef Babath / Fish Ambulthiyal / Cashew Nut Curry).
- **Starters & Soups** — Chicken Caesar Salad; Char-Grilled Chicken/Pork Skewers; Grilled
  Squid Papaya Salad; Mini Mutton Rolls; Black Pepper Tofu Salad; Soup of the Day; Mutton
  Mulligatawny.
- **Bread & Buns** *(served with thick-cut fries / tapioca / sweet potato chips)* — Crispy
  Chicken Burger; Beef Burger; Asian Chicken Floss Mini Baguette; Seafood Masala Godamba
  Wrap; Falafel Hummus Godamba Wrap.
- **Pasta & Pizza** — Spaghetti Carbonara; Sri Lankan Prawn Curry Pasta; Spicy Tomato Penne
  Pasta; Ceylonese Roast Chicken Pizza; Pizza Margherita.
- **Light Lunch** — Tuna Sashimi; Beer Battered Fish & Chips; Grilled Mustard Prawns;
  Grilled Squid; Moroccan Spiced Chicken; Banana Leaf Wrapped Chilli Lemongrass Barramundi;
  Slow-cooked Jaggery Beef Curry Coconut Rice; Sri Lankan Mezze Platter.
- **The Long House Signatures** — *Starters & Soups*: Prawn Ceviche; Green Chili Tuna
  Tartare; Cream of Jackfruit Seed Coconut Soup; Roast Paan Cheese Panini (Chicken/Pork
  Achcharu); Roast Paan Cheese Panini (Polos Achcharu). *Mains*: Southern Tuna Tataki Pizza;
  Kalu Pol Mutton Curry.
- **Rice & Curry** — select one main (Black Pork · Ceylonese Red Chicken · Spicy Lagoon
  Prawn · Fish Ambulthiyal · Beef · Cashew Nut) with steamed white/red rice, ruhunu
  achcharu, four veg curries, papadam, fried dry chilli, pickle, mallum.
- **Dessert** — Cannoli; Curd & Treacle Panna Cotta; Warm Baked Croissant Date Pudding;
  Ceylon Coffee Warm Fudge Brownies; Mini Pineapple Upside Down; Butterscotch Cheesecake;
  Affogato; Tropical Fruit Skewer. *(Rice & Curry desserts: Sliced Mango Suwandel Sticky
  Rice; Pani Pol Pancakes.)*
- **Kids' Menu** — Pizza Margherita; Baked Mac N' Cheese; Spaghetti Tomato Sauce; Crumb
  Fried Chicken; Stir Fried Noodles; Fried Rice; Fish & Chips; Mini Beef Burger; Mini
  Brioche Bun. *Dessert*: Fried Banana Fritters; Two Scoops Ice Cream.
- **Ice Cream & Sorbet** — Milo / Coconut / Cinnamon Honey / Cardamom Tea / Espresso ice
  creams; Chili Pineapple / Pani Dodam / Tamarind Treacle sorbets.

> **Price accuracy:** the à la carte USD prices are right-column values in the PDF whose
> visual row-alignment does not survive text extraction. During seed implementation the PDF
> pages will be **rendered to images and read visually** to map each price to its dish
> exactly, rather than inferred from extracted text order. The seeded result will be
> verified by the user against the source PDFs on review.

## 9. Navigation / Middleware / Breadcrumbs

No changes: `/m/` is already a public route in middleware; the menus sidebar entry and
breadcrumb label already exist. Admin/public routes keep their current paths.

## 10. Testing / Verification

- Migration applied to Supabase; `menus` table + new columns present; backfill attached
  property 906's stray category.
- Seed run; The Long House shows 7 set menus (correct day mapping) + Seven to Seven.
- Public `/m/the-long-house`: selection screen → Set Menu defaults to today (Asia/Colombo),
  day switcher browses all 7; Seven to Seven lists all sections with prices.
- Admin page: class/day switching, create-missing-day, section/item CRUD all functional.
- `npx tsc --noEmit` clean (authoritative build is Linux/Coolify; local build is known to
  deadlock — verify by inspection + tsc).
- User visually verifies seeded copy/prices against the two source PDFs.

## 11. Risks

- **Migration↔merge crash window**: adding a NOT-NULL-after-backfill `menu_id` and reading
  `menus` in Server Components means the migration must be applied to prod **before** the
  app code merges, or the menu pages 500. Apply-before-merge is mandatory.
- **Transcription accuracy**: set-menu dishes transcribed here; à la carte prices to be read
  from rendered PDF. User review gate covers correctness.
