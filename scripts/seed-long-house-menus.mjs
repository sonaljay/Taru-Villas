import postgres from 'postgres'
import fs from 'node:fs'

const env = fs.readFileSync('.env.local', 'utf8')
const url = (env.match(/^POSTGRES_URL=(.*)$/m) || env.match(/^DATABASE_URL=(.*)$/m))[1]
  .replace(/^["']|["']$/g, '')
const sql = postgres(url, { prepare: false })

const PROPERTY_ID = '5351150a-080b-446b-a9d5-a2cb93109332' // The Long House

const SET_INTRO =
  "At The Long House, our food reflects the Southern coastline — bold, vibrant, and rooted in tradition. Fresh seafood takes centre stage, complemented by local ingredients like coconut, lime, goraka, and aromatic spices. These are today's set menu selections. Should you wish to order à la carte, our Seven to Seven menu is available as well."
const SET_FOOTER =
  'Includes a selection of tea, coffee & petit fours. All prices are inclusive of government taxes & service charges.'

const veg = (title, description) => ({ title, description, tags: ['Vegetarian'] })
const dish = (title, description) => ({ title, description, tags: [] })

const RICE_AND_CURRY = {
  name: "Chef's Special — Rice & Curry",
  priceNote: '$25 per person',
  description:
    'Choose your rice (White / Red), a fresh side (Mallum / Ruhunu Achcharu) and one main curry below — served with four vegetable curries, papadam, fried dry chilli, and pickle.',
  items: [
    dish('Black Pork Curry', null),
    dish('Ceylonese Red Chicken Curry', null),
    dish('Spicy Lagoon Prawn Curry', null),
    dish('Fish Ambulthiyal', null),
    dish('Beef Curry', null),
    dish('Cashew Nut Curry', null),
  ],
}
const KOTTU = {
  name: "Chef's Special — Sri Lankan Kottu Roti",
  priceNote: '$25 per person',
  description:
    'Chopped godamba roti stir-fried with vegetables & onions. Please select one option, served with a selection of side dishes.',
  items: [
    dish('Roast Chicken Kottu', 'Godamba roti stir-fried with roast chicken, vegetables & spices'),
    dish('Hot Butter Cuttlefish', 'Crispy cuttlefish tossed in a Chinese–Sri Lankan style hot butter sauce'),
    dish('Deviled Beef', 'Stir-fried beef with onions, capsicum & spicy deviled sauce'),
    dish('Pork Stew', 'Slow-cooked pork in a mildly spiced gravy'),
  ],
}
const STRING_HOPPER = {
  name: "Chef's Special — String Hopper Pilau",
  priceNote: '$25 per person',
  description:
    'Tempered string hoppers with vegetables, aromatic spices & coconut gravy. Please select one option, served with a selection of side dishes.',
  items: [
    dish('Mustard Fish or Prawn Curry', 'Prepared with ground mustard, garlic & unroasted curry powder'),
    dish('Deviled Crab', 'Spicy stir-fried crab with onions and chili'),
    dish('Black Chicken or Pork Curry', 'Slow-cooked meat curry, flavoured with roasted curry powder'),
  ],
}
const REFRESHER = dish("Tonight's Signature Taste Refresher", 'A seasonal palate cleanser, selected by the chef')
const FRUIT = dish('Seasonal Fruit Platter', null)

const SET_MENUS = {
  1: { // Monday
    starters: [
      dish('Prawn Squid Salad', 'With mint, coriander, coconut, peanut, pomegranate & tamarind sauce'),
      veg('Roasted Carrot Soup', 'With garlic bread, crème fraiche & basil leaf'),
      REFRESHER,
    ],
    mains: [
      dish('Asian Herb Crust Baked Barramundi', 'With stir fried green bean, sweet potato lyonnaise & red curry lemongrass cream'),
      veg('Pumpkin Gnocchi', 'With sun dried tomato salsa, basil oil & garlic cream sauce'),
      dish('Pork Skewer', 'With braised leeks, pickled red cabbage & garlic cream'),
      dish('Baked Mediterranean Chicken', 'With curry leaf hummus, wilted spinach & mint curd'),
    ],
    desserts: [
      dish('Coconut & Passion Fruit Crème Brûlée', 'With cashew nut crumbs & torched sugar'),
      dish('Baked Alaska', 'With Milo, coconut & cinnamon honey ice cream'),
      FRUIT,
    ],
    chefsSpecial: RICE_AND_CURRY,
  },
  2: { // Tuesday
    starters: [
      dish('Grilled Coriander Seafood', 'With Carrot Mint Salad, Tahini Yogurt, Coriander Curd, & Root Chips'),
      veg('Cream of Cauliflower Soup', 'With Roasted Almond, Fresh Cream, & Parsley'),
      dish('Chicken Croquettes', 'With Cauliflower Puree, Tomato Salsa, & Pickled Cucumber'),
      REFRESHER,
    ],
    mains: [
      dish('Pan-Fried Barramundi', 'With Curried Lentil Spinach, Seafood Bisque, & Mango Chutney'),
      veg('Miso Glazed Tofu', 'With Citrus Salad & Sweet Corn Croquettes'),
      dish('Pork Piccata', 'With Spaghetti Aglio e Olio, Roasted Vegetables, & Lemon Mustard Sauce'),
    ],
    desserts: [
      dish('Chocolate Banana Tart', 'With Peanut Butter Crumble & Cinnamon Honey Ice Cream'),
      dish('Coconut Panna Cotta', 'With Pineapple Salsa & Coconut Chips'),
      FRUIT,
    ],
    chefsSpecial: KOTTU,
  },
  3: { // Wednesday
    starters: [
      dish('Asian Crispy Squid', 'With Garden Greens, Spicy Mayo, & Fried Curry Leaves'),
      dish('French Onion Soup', 'With Chicken Broth, Cheese, & Baguette Crouton'),
      veg('Fried Lentil Fritters', 'With Raw Mango Achcharu, Coconut Mint, & Cucumber Raita'),
      REFRESHER,
    ],
    mains: [
      dish('Stir Fried Seafood & Cashew Nut', 'With Garlic Rice, Fried Egg, & Spring Onion'),
      veg('Linguine Tomato Cream', 'With Fresh Tomato Sauce, Basil, & Parmesan Cream'),
      dish('Slow-Cooked Curried Beef Stew Pie', 'With Garlic Mash, Honey Glazed Carrot, & Spring Onion'),
    ],
    desserts: [
      dish('Warm Chocolate Fondant', 'With Vanilla Ice Cream & Fresh Mint'),
      dish('Mango Crumble', 'With Vanilla Ice Cream & Mint Leaves'),
      FRUIT,
    ],
    chefsSpecial: STRING_HOPPER,
  },
  4: { // Thursday
    starters: [
      dish('Beer Battered Fish', 'With Fresh Green Salad, Preserved Mango, & Miso Mayo'),
      veg('Vegetable Minestrone Soup', 'With Green Beans, Penne Pasta, & Parsley'),
      dish('Thai Beef Salad', 'With Mixed Leaves, Cucumber, Spring Onion, & Thai Citrus Dressing'),
      REFRESHER,
    ],
    mains: [
      dish('Fried Crispy Prawns', 'With Gotukola Salad, Root Vegetables, & Miso Cream'),
      veg('Vegetable Lasagna', 'With Parmigiano Reggiano, Basil Pesto, & Cheese Sauce'),
      dish('Mushroom Stuffed Chicken', 'With Green Pea Mash, Stir Fried Cabbage, & Pesto Sauce'),
    ],
    desserts: [
      dish('Lime Curd Meringue Tart', 'With Almond Flakes & Coconut Ice Cream'),
      dish('Tres Leches Cake', 'With Condensed Milk & Whipping Cream'),
      FRUIT,
    ],
    chefsSpecial: KOTTU,
  },
  5: { // Friday
    starters: [
      dish('Asian Salad Niçoise', 'With Peppered Tuna, Boiled Egg, Fried Sprats, Beans, & Sweet Potato'),
      veg('Curried Pumpkin Soup', 'With Curry Leaf Pesto & Ceylon Spices'),
      dish('Herb Crusted Beef Carpaccio', 'With Green Salad, Parmigiano Reggiano, & Basil Oil'),
      REFRESHER,
    ],
    mains: [
      dish('Grilled Garlic Prawn', 'With Cauliflower Puree, Wilted Spinach, & Basil Pesto Butter'),
      veg('String Hopper Pilaf', 'With Cashew Nut Curry, Tofu Tempered, & Curry Leaves'),
      dish('Sri Lankan Pan Fried Kottu Roti', 'Chicken / Beef / Pork / Vegetable'),
    ],
    desserts: [
      dish('Coconut & Sago Pearls', 'With Roasted Cashew Nuts & Jaggery Syrup'),
      dish('Fried Churros', 'With Crème Fraîche, Butterscotch Sauce, & Cinnamon Sugar'),
      FRUIT,
    ],
    chefsSpecial: RICE_AND_CURRY,
  },
  6: { // Saturday
    starters: [
      dish('Seafood Laksa', 'With Fresh Tomato, Soft-Boiled Egg, Rice Noodles, & Spring Onion'),
      veg('BBQ Tofu Salad', 'With Raw Mango, Crunchy Lettuce, & Mustard Vinaigrette'),
      dish('Pork Pineapple Salad', 'With Garden Greens, Cucumber, Tomato, & Mustard Vinaigrette'),
      REFRESHER,
    ],
    mains: [
      dish('Seafood Kabsa Rice', 'With Tomato Gravy, Cucumber Raita, & Papadum'),
      veg('Spinach & Cream Cheese Ravioli', 'With Pesto Cream & Parmigiano Reggiano'),
      dish('Mountain of Meat Pizza', 'With Ground Beef, Slow Cooked Pork, Sausage, Mozzarella, & Tomato'),
    ],
    desserts: [
      dish('Pumpkin Custard Cake', 'With Baked Butternut Squash & Honey Cinnamon Ice Cream'),
      dish('Poached Pineapple Spiced Syrup', 'With Cashew Nut Crumble & Coconut Ice Cream'),
      FRUIT,
    ],
    chefsSpecial: STRING_HOPPER,
  },
  0: { // Sunday
    starters: [
      dish('Fish Tikka', 'With Cucumber Salad & Raita'),
      veg('Pakora Platter', 'With Curried Beetroot, Garden Vegetable, & Mango Chutney'),
      dish('Creamy Leek & Chicken Soup', 'With Garlic Croutons & Chopped Parsley'),
      REFRESHER,
    ],
    mains: [
      dish('Seafood Pasta', 'With Linguine Pasta, Parmesan Cheese, & Basil Cream'),
      veg('Paneer Makhani', 'With Bun Paratha & Mint Chutney'),
      dish('Masala Mutton Biryani', 'With Egg, Green Chutney & Raita, Papadam'),
    ],
    desserts: [
      dish('Watalappam', 'With Kithul Treacle & Toasted Cashew Nuts'),
      dish('Baked Alaska', 'With Milo Ice Cream, Coconut Ice Cream, & Cinnamon Honey Ice Cream'),
      FRUIT,
    ],
    chefsSpecial: RICE_AND_CURRY,
  },
}

// Sections follow spec §8.1 order. Prices read from rendered PDF images.
const A_LA_CARTE = {
  name: 'Seven to Seven',
  footerNote: 'Prices are inclusive of service charge & applicable taxes.',
  sections: [
    {
      name: 'All Day Breakfast',
      items: [
        { title: 'Pastry and Bakery Basket', description: 'Kurakkan Sourdough & Baguette Toast | Muffin | Croissant | Preserves | Butter', price: 'USD 7' },
        { title: 'Fresh Juice', description: null, price: 'USD 5' },
        { title: 'Seasonal Fruit Platter / Herbal Porridge', description: null, price: 'USD 4' },
        { title: 'Ceylon Tea', description: null, price: 'USD 3' },
        { title: 'Ceylon Coffee', description: null, price: 'USD 4' },
        { title: 'Breakfast Power Bowl', description: 'Rice Flakes | Tropical Fruit | Buffalo Curd | Treacle', price: 'USD 5' },
        { title: 'Coconut Cashew Nut Granola', description: 'Buffalo Curd | Coconut Shavings | Treacle | Tropical Fruit', price: 'USD 9' },
        { title: 'Kurakkan Banana Pancakes / Coconut Waffles / French Toast', description: 'Kithul Treacle | Butterscotch | Cinnamon Cream | Chocolate Sauce', price: 'USD 5' },
        { title: 'Egg Hopper Benedict', description: 'Two Poached Eggs | Pork or Chicken Ham | Curried Hollandaise Sauce', price: 'USD 7' },
        { title: 'Full English Two Eggs Done Your Way', description: 'Mushrooms Tempered | Baked Kaupi Beans | Spiced Potato Cracker | Chicken Lingus | Pork or Chicken Bacon | Grilled Tomato Sourdough Toast', price: 'USD 12' },
      ],
    },
    {
      name: 'Truly Sri Lankan',
      description: 'Please pre-order the night before. Truly Sri Lankan Extras (add-on, one of your choice): Red Chicken | Curry Black Pork | Curry Beef Babath | Fish Ambulthiyal | Cashew Nut Curry.',
      items: [
        { title: 'Coconut Roti', description: 'Lunu Miris | Seeni Sambol', price: 'USD 9' },
        { title: 'String Hoppers', description: 'Dhal Curry | Coconut Sambol', price: 'USD 9' },
        { title: 'Green Gram Kiri Bath Bowl', description: 'Fried Curry Leaves | Onion Chips', price: 'USD 9' },
        { title: 'Coconut Pittu', description: 'Coconut Milk | Lunu Miris', price: 'USD 9' },
      ],
    },
    {
      name: 'Starters & Soups',
      items: [
        { title: 'Chicken Caesar Salad', description: 'Crunchy Lettuce | Soft Poached Egg | Anchovy Croutons | Pork / Chicken Bacon', price: 'USD 17' },
        { title: 'Char-Grilled Chicken / Pork Skewers', description: 'Devilled Sauce | Mango Achcharu', price: 'USD 16' },
        { title: 'Grilled Squid Papaya Salad', description: 'Dried Shrimp | Tamarind Pulp | Sweet Chilli Sauce', price: 'USD 16' },
        { title: 'Mini Mutton Rolls', description: 'Tomato Chutney | Fried Curry Leaves', price: 'USD 17' },
        { title: 'Black Pepper Tofu Salad', description: 'Citrus Salad | Roasted Cashew | Siracha Lime Dressing', price: 'USD 14' },
        { title: 'Soup of the Day', description: 'Grissini Sticks | Fried Onion', price: 'USD 10' },
        { title: 'Mutton Mulligatawny', description: 'Steamed Rice | Lime Wedges | Garlic Flakes', price: 'USD 10' },
      ],
    },
    {
      name: 'Bread & Buns',
      description: 'Served with a choice of thick-cut fries, tapioca chips or sweet potato chips.',
      items: [
        { title: 'Crispy Chicken Burger', description: 'Mustard Mayo | Onion Rings', price: 'USD 15' },
        { title: 'Beef Burger', description: 'Chia Seed Brioche Bun | Melted Cheese | Onion Rings | BBQ Sauce', price: 'USD 17' },
        { title: 'Asian Chicken Floss Mini Baguette', description: 'Pickled Cabbage | Spicy Mayo | Spring Onion', price: 'USD 14' },
        { title: 'Seafood Masala Godamba Wrap', description: 'Onion Rings | Paneer | Coriander Leaf', price: 'USD 16' },
        { title: 'Falafel Hummus Godamba Wrap', description: 'Carrot Mint Salad | Tahini Yoghurt | Coriander Curd', price: 'USD 12' },
      ],
    },
    {
      name: 'Pasta & Pizza',
      items: [
        { title: 'Spaghetti Carbonara', description: 'Parmesan Cheese | Fresh Cream | Parsley | Pork Bacon / Chicken', price: 'USD 14' },
        { title: 'Sri Lankan Prawn Curry Pasta', description: 'Linguine Pasta | Parmesan Cheese | Coconut Cream', price: 'USD 16' },
        { title: 'Spicy Tomato Penne Pasta', description: 'Garlic | Chilli Flakes | Olives | Parmesan Cheese | Parsley', price: 'USD 13' },
        { title: 'Ceylonese Roast Chicken Pizza', description: 'Curry Sauce | Curry Leaves | Pol Sambol | Mozzarella', price: 'USD 13' },
        { title: 'Pizza Margherita', description: 'Mozzarella Cheese | Fresh Tomato Sauce | Basil', price: 'USD 13' },
      ],
    },
    {
      name: 'Light Lunch',
      items: [
        { title: 'Tuna Sashimi', description: 'Tomato Salsa | Spring Onion | Soy Miso Dressing', price: 'USD 16' },
        { title: 'Beer Battered Fish & Chips', description: 'Barramundi Fillet | Mushy Peas | Apple Cider Vinegar | Thick Cut Fries | Tartare Sauce', price: 'USD 20' },
        { title: 'Grilled Mustard Prawns', description: 'Sweet Potato Lyonnaise | Almond Cauliflower Puree | Caper Beurre Blanc', price: 'USD 21' },
        { title: 'Grilled Squid', description: 'Chimichurri | Roasted Pumpkin | Lemon Aioli | Fried Shallots', price: 'USD 17' },
        { title: 'Moroccan Spiced Chicken', description: 'Hummus | Garlic Labneh | Gotukola Salad | Pita Bread', price: 'USD 16' },
        { title: 'Banana Leaf Wrapped Chili Lemongrass Barramundi', description: 'Carrot Sambal | Bun Paratha | Curry Gravy', price: 'USD 18' },
        { title: 'Slow-cooked Jaggery Beef Curry Coconut Rice', description: 'Fried Sprats | Peanut | Malay Pickle | Homemade Chili Sauce', price: 'USD 21' },
        { title: 'Sri Lankan Mezze Platter', description: 'Coconut Flat Bread | Potato Tempered | Curry Leaf Hummus | Sweet Onion Relish | Citrus Gotukola Salad', price: 'USD 14' },
      ],
    },
    {
      // All 7 items in one flat section; PDF sub-labels Starters & Soups / Mains are noted
      // in item order: starters first (Prawn Ceviche, Green Chili Tuna Tartare, Soup),
      // then mains (Paninis, Tataki Pizza, Kalu Pol).
      name: 'The Long House Signatures',
      items: [
        { title: 'Prawn Ceviche', description: 'Pickled Ambarella | Suwandel Rice Cracker | Curry Leaf Pesto', price: 'USD 16' },
        { title: 'Green Chili Tuna Tartare', description: 'Lunu Dehi | Sinhala Achcharu Mayo | Manioc Chips', price: 'USD 14' },
        { title: 'Cream of Jackfruit Seed Coconut Soup', description: 'Curry Leaf Oil | Roasted Peanut', price: 'USD 5' },
        { title: 'Roast Paan Cheese Panini', description: 'Ruhunu Chicken / Pork Achcharu', price: 'USD 16' },
        { title: 'Roast Paan Cheese Panini', description: 'Ruhunu Polos Achcharu', price: 'USD 10' },
        { title: 'Southern Tuna Tataki Pizza', description: 'Tuna Ambulthiyal | Mozzarella Cheese | Burnt Coconut Flakes', price: 'USD 15' },
        { title: 'Kalu Pol Mutton Curry', description: 'Savoury Rice | Buffalo Curd | Pickled Cucumber', price: 'USD 18' },
      ],
    },
    {
      name: 'Rice & Curry',
      description: 'Select one of the below and devour along with Steamed White / Red Rice | Ruhunu Achcharu | Four Vegetable Curries | Papadam | Fried Dry Chilli | Pickle | Mallum.',
      items: [
        { title: 'Black Pork Curry', description: null, price: 'USD 15' },
        { title: 'Ceylonese Red Chicken Curry', description: null, price: 'USD 12' },
        { title: 'Spicy Lagoon Prawn Curry', description: null, price: 'USD 19' },
        { title: 'Fish Ambulthiyal', description: null, price: 'USD 15' },
        { title: 'Beef Curry', description: null, price: 'USD 17' },
        { title: 'Cashew Nut Curry', description: null, price: 'USD 12' },
      ],
    },
    {
      // Includes the two Rice & Curry desserts at the end per spec §8.1
      name: 'Dessert',
      items: [
        { title: 'Cannoli', description: 'Cashew Cream | Peanut Nugget', price: 'USD 8' },
        { title: 'Curd and Treacle Panna Cotta', description: 'Honey Tuile | Mint Leaves', price: 'USD 7' },
        { title: 'Warm Baked Croissant Date Pudding', description: 'Kithul Jaggery | Coconut Cream', price: 'USD 7' },
        { title: 'Ceylon Coffee Warm Fudge Brownies', description: 'Cinnamon Honey Ice Cream | Cashew Nut Crumble', price: 'USD 11' },
        { title: 'Mini Pineapple Upside Down', description: 'Cinnamon Cream | Kithul Syrup', price: 'USD 6' },
        { title: 'Butterscotch Cheesecake', description: 'Passion Fruit Compote | Fresh Mint', price: 'USD 8' },
        { title: 'Affagato', description: 'Espresso | Amaretto | Vanilla Ice Cream', price: 'USD 13' },
        { title: 'Tropical Fruit Skewer', description: 'Fresh Mint | Cardamom Honey Syrup', price: 'USD 7' },
        { title: 'Sliced Mango Suwandel Sticky Rice', description: 'Mung Bean | Raisin | Cinnamon Cream', price: 'USD 6' },
        { title: 'Pani Pol Pancakes', description: 'Caramelized Coconut | Cardamon Tea Ice Cream', price: 'USD 6' },
      ],
    },
    {
      name: "Kids' Menu",
      description: 'Buns and sandwiches served with a choice of thick-cut fries or sweet potato chips.',
      items: [
        { title: 'Pizza Margherita', description: 'Mozzarella Cheese | Fresh Tomato Sauce | Basil', price: 'USD 5' },
        { title: "Baked Mac N' Cheese", description: 'Pork Bacon / Chicken / Seafood', price: 'USD 9' },
        { title: 'Spaghetti Tomato Sauce', description: 'Beef / Pork Bacon / Chicken Bacon / Seafood', price: 'USD 9' },
        { title: 'Crumb Fried Chicken', description: 'Almond Cauliflower Puree | BBQ Sauce', price: 'USD 9' },
        { title: 'Stir Fried Noodles', description: 'Chicken / Seafood', price: 'USD 9' },
        { title: 'Fried Rice', description: 'Chicken / Seafood / Egg', price: 'USD 9' },
        { title: 'Fish & Chips', description: 'Mushy Pea | Tartar Sauce', price: 'USD 9' },
        { title: 'Mini Beef Burger', description: 'Cucumber Slice | Fresh Tomato | Cheese', price: 'USD 9' },
        { title: 'Mini Brioche Bun', description: 'Tomato and Cheese / Tuna Mayo', price: 'USD 6' },
        { title: 'Fried Banana Fritters', description: 'Cinnamon Honey Ice Cream | Chocolate Sauce', price: 'USD 5' },
        { title: 'Two Scoops Ice Cream', description: 'Milo Ice Cream | Vanilla Ice Cream', price: 'USD 4' },
      ],
    },
    {
      name: 'Ice Cream & Sorbet',
      items: [
        { title: 'Milo Ice Cream', description: null, price: 'USD 4' },
        { title: 'Coconut Ice Cream', description: null, price: 'USD 4' },
        { title: 'Cinnamon Honey Ice Cream', description: null, price: 'USD 4' },
        { title: 'Cardamon Tea Ice Cream', description: null, price: 'USD 4' },
        { title: 'Espresso Ice Cream', description: null, price: 'USD 5' },
        { title: 'Chili Pineapple Sorbet', description: null, price: 'USD 3' },
        { title: 'Pani Dodam Sorbet', description: null, price: 'USD 3' },
        { title: 'Tamarind Treacle Sorbet', description: null, price: 'USD 3' },
      ],
    },
  ],
}

async function insertMenuWithSections(menu) {
  const [m] = await sql`
    insert into menus (property_id, type, day_of_week, name, description, price_note, footer_note, sort_order)
    values (${PROPERTY_ID}, ${menu.type}, ${menu.dayOfWeek ?? null}, ${menu.name},
            ${menu.description ?? null}, ${menu.priceNote ?? null}, ${menu.footerNote ?? null}, ${menu.sortOrder ?? 0})
    returning id`
  let catSort = 0
  for (const section of menu.sections) {
    const [c] = await sql`
      insert into menu_categories (property_id, menu_id, name, description, price_note, sort_order)
      values (${PROPERTY_ID}, ${m.id}, ${section.name}, ${section.description ?? null}, ${section.priceNote ?? null}, ${catSort++})
      returning id`
    let itemSort = 0
    for (const it of section.items) {
      await sql`
        insert into menu_items (category_id, title, description, price, tags, sort_order)
        values (${c.id}, ${it.title}, ${it.description ?? null}, ${it.price ?? null},
                ${it.tags ?? []}, ${itemSort++})`
    }
  }
  return m.id
}

async function main() {
  // Wipe existing menus for this property (cascade clears categories + items)
  await sql`delete from menus where property_id = ${PROPERTY_ID}`
  // Clear any orphan categories that predate the menus table for this property
  await sql`delete from menu_categories where property_id = ${PROPERTY_ID}`

  // Set menus — Mon through Sun
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  let sort = 0
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const def = SET_MENUS[dow]
    const sections = [
      { name: 'Starter & Soup', items: def.starters },
      { name: 'Mains', items: def.mains },
      { name: 'Dessert', items: def.desserts },
      {
        name: def.chefsSpecial.name,
        description: def.chefsSpecial.description,
        priceNote: def.chefsSpecial.priceNote,
        items: def.chefsSpecial.items,
      },
    ]
    await insertMenuWithSections({
      type: 'set',
      dayOfWeek: dow,
      name: DAY_NAMES[dow],
      description: SET_INTRO,
      priceNote: '$40 per person',
      footerNote: SET_FOOTER,
      sortOrder: sort++,
      sections,
    })
  }

  // À la carte
  await insertMenuWithSections({
    type: 'a_la_carte',
    dayOfWeek: null,
    name: A_LA_CARTE.name,
    footerNote: A_LA_CARTE.footerNote,
    sortOrder: 100,
    sections: A_LA_CARTE.sections,
  })

  const counts = await sql`
    select m.type, count(distinct m.id) menus, count(distinct mc.id) sections, count(mi.id) items
    from menus m
    left join menu_categories mc on mc.menu_id = m.id
    left join menu_items mi on mi.category_id = mc.id
    where m.property_id = ${PROPERTY_ID}
    group by m.type`
  console.log(counts)
  await sql.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
