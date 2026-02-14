const TAXONOMY_RULES = [
  { leaf: 'reusable_bottle', tokens: ['hydro flask', 'flask', 'thermos', 'steel bottle', 'reusable bottle', 'insulated bottle'] },
  { leaf: 'single_use_plastic_bottle', tokens: ['plastic bottle', 'water bottle', 'pet bottle', 'single use bottle', 'single-use bottle'] },
  { leaf: 'glass_bottle', tokens: ['glass bottle'] },
  { leaf: 'aluminum_can', tokens: ['aluminum can', 'aluminium can', 'soda can', 'drink can'] },
  { leaf: 'paper_cup', tokens: ['paper cup', 'coffee cup', 'disposable cup'] },
  { leaf: 'reusable_cup_tumbler', tokens: ['tumbler', 'travel mug', 'reusable cup'] },
  { leaf: 'straw_plastic', tokens: ['plastic straw', 'disposable straw'] },
  { leaf: 'straw_reusable', tokens: ['metal straw', 'reusable straw', 'silicone straw'] },
  { leaf: 'takeout_container_plastic', tokens: ['takeout container', 'takeout box', 'plastic container'] },
  { leaf: 'takeout_container_fiber', tokens: ['compostable container', 'bagasse container', 'fiber container'] },
  { leaf: 'styrofoam_box', tokens: ['styrofoam', 'foam box'] },
  { leaf: 'reusable_lunchbox', tokens: ['lunchbox', 'lunch box', 'steel container', 'glass container'] },
  { leaf: 'plastic_wrap', tokens: ['plastic wrap', 'cling film', 'saran wrap'] },
  { leaf: 'zip_bag_single_use', tokens: ['zip bag', 'plastic zip bag'] },
  { leaf: 'zip_bag_reusable', tokens: ['silicone bag', 'reusable zip bag'] },
  { leaf: 'paper_bag', tokens: ['paper bag'] },
  { leaf: 'snack_wrapper', tokens: ['wrapper', 'snack packet', 'chips packet'] },
  { leaf: 'plastic_fork_spoon', tokens: ['plastic fork', 'plastic spoon', 'disposable cutlery', 'plastic cutlery'] },
  { leaf: 'wooden_cutlery', tokens: ['wooden fork', 'wooden spoon', 'wooden cutlery'] },
  { leaf: 'reusable_cutlery', tokens: ['metal cutlery', 'reusable cutlery', 'travel cutlery'] },
  { leaf: 'paper_plate', tokens: ['paper plate'] },
  { leaf: 'plastic_plate', tokens: ['plastic plate'] },
  { leaf: 'cloth_napkin', tokens: ['cloth napkin', 'reusable napkin'] },
  { leaf: 'napkin_paper', tokens: ['paper napkin', 'tissue napkin'] },
  { leaf: 'plastic_bag', tokens: ['plastic bag', 'grocery bag', 'carry bag'] },
  { leaf: 'cloth_tote_bag', tokens: ['tote bag', 'cloth bag', 'canvas bag'] },
  { leaf: 'jute_bag', tokens: ['jute bag'] },
  { leaf: 'backpack', tokens: ['backpack'] },
  { leaf: 'smartphone', tokens: ['phone', 'smartphone', 'mobile'] },
  { leaf: 'laptop', tokens: ['laptop', 'macbook', 'notebook computer'] },
  { leaf: 'tablet', tokens: ['tablet', 'ipad'] },
  { leaf: 'headphones', tokens: ['headphone', 'headset'] },
  { leaf: 'earbuds', tokens: ['earbuds', 'airpods'] },
  { leaf: 'camera', tokens: ['camera', 'dslr'] },
  { leaf: 'speaker', tokens: ['speaker', 'bluetooth speaker'] },
  { leaf: 'phone_charger', tokens: ['phone charger', 'charging adapter'] },
  { leaf: 'laptop_charger', tokens: ['laptop charger', 'power brick'] },
  { leaf: 'charging_cable', tokens: ['charging cable', 'usb cable', 'type c cable', 'lightning cable'] },
  { leaf: 'power_bank', tokens: ['power bank', 'portable battery'] },
  { leaf: 'extension_board', tokens: ['power strip', 'extension board'] },
  { leaf: 'battery_disposable', tokens: ['disposable battery', 'alkaline battery', 'aa battery', 'aaa battery'] },
  { leaf: 'battery_rechargeable', tokens: ['rechargeable battery'] },
  { leaf: 'light_bulb_led', tokens: ['led bulb', 'led light bulb'] },
  { leaf: 'light_bulb_incandescent', tokens: ['incandescent bulb', 'halogen bulb'] },
  { leaf: 'tshirt', tokens: ['t-shirt', 'tee shirt'] },
  { leaf: 'shirt', tokens: ['shirt'] },
  { leaf: 'jeans', tokens: ['jeans', 'denim pants'] },
  { leaf: 'hoodie', tokens: ['hoodie', 'sweatshirt'] },
  { leaf: 'jacket', tokens: ['jacket', 'coat'] },
  { leaf: 'shoes', tokens: ['shoes', 'sneakers'] },
  { leaf: 'sandals', tokens: ['sandals', 'flip flops'] },
  { leaf: 'toothbrush_plastic', tokens: ['plastic toothbrush', 'toothbrush'] },
  { leaf: 'toothbrush_bamboo', tokens: ['bamboo toothbrush'] },
  { leaf: 'razor_disposable', tokens: ['disposable razor'] },
  { leaf: 'razor_reusable', tokens: ['reusable razor', 'safety razor'] },
  { leaf: 'shampoo_bottle', tokens: ['shampoo bottle'] },
  { leaf: 'soap_bar', tokens: ['soap bar'] },
  { leaf: 'wet_wipes', tokens: ['wet wipes', 'disposable wipes'] },
  { leaf: 'detergent_bottle', tokens: ['detergent bottle', 'laundry detergent'] },
  { leaf: 'cleaner_spray_bottle', tokens: ['cleaner spray', 'spray bottle'] },
  { leaf: 'refill_pouch', tokens: ['refill pouch'] },
  { leaf: 'sponge', tokens: ['sponge'] },
  { leaf: 'microfiber_cloth', tokens: ['microfiber cloth', 'cleaning cloth'] },
  { leaf: 'paper_towel', tokens: ['paper towel'] },
  { leaf: 'reusable_towel', tokens: ['kitchen towel', 'cloth towel'] },
  { leaf: 'trash_bin', tokens: ['trash bin', 'waste bin'] },
  { leaf: 'recycling_bin', tokens: ['recycling bin', 'recycle bin'] },
  { leaf: 'notebook', tokens: ['notebook'] },
  { leaf: 'recycled_notebook', tokens: ['recycled notebook'] },
  { leaf: 'pen_plastic', tokens: ['plastic pen', 'ballpoint pen'] },
  { leaf: 'pen_refillable', tokens: ['refillable pen'] },
  { leaf: 'pencil', tokens: ['pencil'] },
  { leaf: 'marker', tokens: ['marker'] },
  { leaf: 'highlighter', tokens: ['highlighter'] },
  { leaf: 'folder', tokens: ['folder', 'file folder'] },
];

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function inferTaxonomyLeaf(label) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return 'unknown_item';
  }

  for (const rule of TAXONOMY_RULES) {
    for (const token of rule.tokens) {
      const normalizedToken = normalizeText(token);
      if (!normalizedToken) {
        continue;
      }
      if (normalized.includes(normalizedToken) || normalizedToken.includes(normalized)) {
        return rule.leaf;
      }
    }
  }

  return 'unknown_item';
}
