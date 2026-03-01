const { randomUUID } = require("node:crypto");
const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80";

const seedFlowers = [
  {
    id: "rose-red",
    name: "Crimson Rose Bouquet",
    description: "Hand-tied red roses for romantic occasions.",
    price: 34.99,
    occasion: "romance",
    image:
      "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=1000&q=80",
    imageFocusX: 50,
    imageFocusY: 46,
    stock: 15,
    createdAt: "2026-01-05T09:00:00.000Z"
  },
  {
    id: "sunshine-tulip",
    name: "Sunshine Tulip Mix",
    description: "Bright yellow and orange tulips for cheerful gifting.",
    price: 24.5,
    occasion: "birthday",
    image:
      "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1000&q=80",
    imageFocusX: 50,
    imageFocusY: 46,
    stock: 20,
    createdAt: "2026-01-09T12:30:00.000Z"
  },
  {
    id: "pure-lily",
    name: "Pure White Lily Vase",
    description: "Elegant lilies arranged in a clear glass vase.",
    price: 41,
    occasion: "wedding",
    image:
      "https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=1000&q=80",
    imageFocusX: 50,
    imageFocusY: 46,
    stock: 8,
    createdAt: "2026-01-12T08:45:00.000Z"
  },
  {
    id: "pastel-peony",
    name: "Pastel Peony Bundle",
    description: "Soft peonies with seasonal fillers.",
    price: 29.75,
    occasion: "thank-you",
    image:
      "https://images.unsplash.com/photo-1520763185298-1b434c919102?auto=format&fit=crop&w=1000&q=80",
    imageFocusX: 50,
    imageFocusY: 46,
    stock: 12,
    createdAt: "2026-01-15T10:00:00.000Z"
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getStore() {
  if (!globalThis.__FLOWER_STORE__) {
    globalThis.__FLOWER_STORE__ = {
      flowers: clone(seedFlowers),
      orders: [],
      users: [],
      notifications: [],
      settings: {
        heroImage: DEFAULT_HERO_IMAGE,
        updatedAt: new Date().toISOString()
      }
    };
  }
  return globalThis.__FLOWER_STORE__;
}

function createId(size = 12) {
  return randomUUID().replace(/-/g, "").slice(0, size);
}

module.exports = {
  DEFAULT_HERO_IMAGE,
  seedFlowers,
  getStore,
  createId
};
