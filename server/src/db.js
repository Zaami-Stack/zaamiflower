import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, "data", "store.json");

const defaultData = {
  flowers: [
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
  ],
  orders: [],
  settings: {
    heroImage:
      "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80",
    updatedAt: new Date().toISOString()
  }
};

async function ensureDataFile() {
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(defaultData, null, 2), "utf8");
  }
}

async function readData() {
  await ensureDataFile();
  const content = await fs.readFile(dataPath, "utf8");
  return JSON.parse(content);
}

let writeQueue = Promise.resolve();

function writeData(data) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(dataPath, JSON.stringify(data, null, 2), "utf8")
  );
  return writeQueue;
}

export { ensureDataFile, readData, writeData };
