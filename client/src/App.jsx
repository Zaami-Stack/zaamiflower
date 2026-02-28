import { useEffect, useMemo, useState } from "react";
import {
  createFlower,
  createOrder,
  getFlowers,
  getOrders,
  getSession,
  login,
  logout
} from "./api";

const initialFlowerForm = {
  name: "",
  description: "",
  price: "",
  occasion: "general",
  image: "",
  stock: 0
};

const initialCheckoutForm = {
  name: "",
  email: "",
  address: ""
};

const initialLoginForm = {
  email: "",
  password: ""
};

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export default function App() {
  const [flowers, setFlowers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [occasion, setOccasion] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [cart, setCart] = useState({});
  const [flowerForm, setFlowerForm] = useState(initialFlowerForm);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const role = user?.role || "guest";
  const isAdmin = role === "admin";
  const canCheckout = role === "admin" || role === "customer";

  const refreshSession = async () => {
    try {
      const data = await getSession();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setSessionLoading(false);
    }
  };

  const refreshFlowers = async () => {
    setLoading(true);
    try {
      const data = await getFlowers();
      setFlowers(data);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshOrders = async () => {
    if (!isAdmin) {
      setOrders([]);
      return;
    }

    try {
      const data = await getOrders();
      setOrders(data.slice(0, 5));
    } catch (error) {
      setStatusMessage(error.message);
      setOrders([]);
    }
  };

  useEffect(() => {
    refreshSession();
    refreshFlowers();
  }, []);

  useEffect(() => {
    refreshOrders();
  }, [isAdmin]);

  const visibleFlowers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedOccasion = occasion.trim().toLowerCase();
    const parsedMaxPrice = maxPrice.trim() ? Number(maxPrice) : null;

    return flowers.filter((flower) => {
      const searchMatch =
        !normalizedSearch ||
        flower.name.toLowerCase().includes(normalizedSearch) ||
        flower.description.toLowerCase().includes(normalizedSearch);
      const occasionMatch =
        normalizedOccasion === "all" ||
        flower.occasion.toLowerCase() === normalizedOccasion;
      const priceMatch =
        parsedMaxPrice === null ||
        Number.isNaN(parsedMaxPrice) ||
        flower.price <= parsedMaxPrice;
      return searchMatch && occasionMatch && priceMatch;
    });
  }, [flowers, search, occasion, maxPrice]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([flowerId, quantity]) => {
          const flower = flowers.find((candidate) => candidate.id === flowerId);
          if (!flower) {
            return null;
          }
          return {
            flowerId,
            quantity,
            flower,
            lineTotal: flower.price * quantity
          };
        })
        .filter(Boolean),
    [cart, flowers]
  );

  const cartTotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const adjustCart = (flowerId, delta) => {
    setCart((previous) => {
      const nextQuantity = (previous[flowerId] || 0) + delta;
      if (nextQuantity <= 0) {
        const { [flowerId]: _removed, ...rest } = previous;
        return rest;
      }
      return { ...previous, [flowerId]: nextQuantity };
    });
  };

  const submitFlower = async (event) => {
    event.preventDefault();
    try {
      await createFlower({
        ...flowerForm,
        price: Number(flowerForm.price),
        stock: Number(flowerForm.stock)
      });
      setFlowerForm(initialFlowerForm);
      setStatusMessage("Flower added to catalog.");
      refreshFlowers();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const placeOrder = async (event) => {
    event.preventDefault();

    if (!canCheckout) {
      setStatusMessage("Please sign in as customer or admin to place orders.");
      return;
    }

    if (cartItems.length === 0) {
      setStatusMessage("Your cart is empty.");
      return;
    }

    try {
      const payload = {
        customer: checkoutForm,
        items: cartItems.map((item) => ({
          flowerId: item.flowerId,
          quantity: item.quantity
        }))
      };
      await createOrder(payload);
      setCart({});
      setCheckoutForm(initialCheckoutForm);
      setStatusMessage("Order placed successfully.");
      refreshFlowers();
      if (isAdmin) {
        refreshOrders();
      }
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const data = await login(loginForm);
      setUser(data.user);
      setLoginForm(initialLoginForm);
      setStatusMessage(`Signed in as ${data.user.role}.`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Best-effort local session clear on client side.
    }
    setUser(null);
    setOrders([]);
    setStatusMessage("Signed out.");
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="heroTop">
          <div>
            <p className="eyebrow">Bloom Basket</p>
            <h1>Full-Stack Flower Shop</h1>
            <p>Role-based access enabled for admin/customer accounts.</p>
          </div>

          <div className="authCard">
            {sessionLoading ? (
              <p>Checking session...</p>
            ) : user ? (
              <div className="signedIn">
                <p>
                  Signed in as <strong>{user.email}</strong>
                </p>
                <p className="roleBadge">Role: {user.role}</p>
                <button type="button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            ) : (
              <form className="form" onSubmit={handleLogin}>
                <input
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="Email"
                  type="email"
                  required
                />
                <input
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      password: event.target.value
                    }))
                  }
                  placeholder="Password"
                  type="password"
                  required
                />
                <button type="submit">Login</button>
              </form>
            )}
          </div>
        </div>
      </header>

      {statusMessage ? <div className="alert">{statusMessage}</div> : null}

      <section className="layout">
        <div className="panel">
          <h2>Browse Flowers</h2>
          <div className="filters">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search flowers..."
            />
            <select
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
            >
              <option value="all">All occasions</option>
              <option value="romance">Romance</option>
              <option value="birthday">Birthday</option>
              <option value="wedding">Wedding</option>
              <option value="thank-you">Thank you</option>
              <option value="general">General</option>
            </select>
            <input
              value={maxPrice}
              type="number"
              min="1"
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Max price"
            />
          </div>

          {loading ? <p>Loading flowers...</p> : null}

          <div className="catalog">
            {visibleFlowers.map((flower) => (
              <article key={flower.id} className="card">
                <div
                  className="image"
                  style={{
                    backgroundImage: flower.image
                      ? `url(${flower.image})`
                      : "linear-gradient(120deg,#f8c9d4,#e8f6d5)"
                  }}
                />
                <div className="cardBody">
                  <div className="row">
                    <h3>{flower.name}</h3>
                    <strong>{currency(flower.price)}</strong>
                  </div>
                  <p>{flower.description}</p>
                  <div className="row">
                    <small>{flower.occasion}</small>
                    <small>Stock: {flower.stock}</small>
                  </div>
                  <button
                    disabled={flower.stock <= 0}
                    onClick={() => adjustCart(flower.id, 1)}
                  >
                    {flower.stock > 0 ? "Add to cart" : "Out of stock"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!loading && visibleFlowers.length === 0 ? <p>No flowers found.</p> : null}
        </div>

        <div className="panel stack">
          <div>
            <h2>Cart & Checkout</h2>
            {cartItems.length === 0 ? (
              <p>Cart is empty.</p>
            ) : (
              <div className="cartList">
                {cartItems.map((item) => (
                  <div key={item.flowerId} className="cartItem">
                    <div>
                      <strong>{item.flower.name}</strong>
                      <p>{currency(item.lineTotal)}</p>
                    </div>
                    <div className="qty">
                      <button onClick={() => adjustCart(item.flowerId, -1)}>
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button onClick={() => adjustCart(item.flowerId, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
                <p className="total">Total: {currency(cartTotal)}</p>
              </div>
            )}

            {canCheckout ? (
              <form className="form" onSubmit={placeOrder}>
                <input
                  value={checkoutForm.name}
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Full name"
                  required
                />
                <input
                  value={checkoutForm.email}
                  type="email"
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="Email"
                  required
                />
                <textarea
                  value={checkoutForm.address}
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      address: event.target.value
                    }))
                  }
                  placeholder="Delivery address"
                  required
                />
                <button type="submit">Place order</button>
              </form>
            ) : (
              <p className="guardText">
                Login with customer or admin role to place an order.
              </p>
            )}
          </div>

          <div>
            <h2>Add Flower (Admin)</h2>
            {isAdmin ? (
              <form className="form" onSubmit={submitFlower}>
                <input
                  value={flowerForm.name}
                  onChange={(event) =>
                    setFlowerForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Flower name"
                  required
                />
                <input
                  value={flowerForm.price}
                  type="number"
                  min="1"
                  step="0.01"
                  onChange={(event) =>
                    setFlowerForm((current) => ({
                      ...current,
                      price: event.target.value
                    }))
                  }
                  placeholder="Price"
                  required
                />
                <input
                  value={flowerForm.stock}
                  type="number"
                  min="0"
                  onChange={(event) =>
                    setFlowerForm((current) => ({
                      ...current,
                      stock: event.target.value
                    }))
                  }
                  placeholder="Stock"
                  required
                />
                <select
                  value={flowerForm.occasion}
                  onChange={(event) =>
                    setFlowerForm((current) => ({
                      ...current,
                      occasion: event.target.value
                    }))
                  }
                >
                  <option value="general">General</option>
                  <option value="romance">Romance</option>
                  <option value="birthday">Birthday</option>
                  <option value="wedding">Wedding</option>
                  <option value="thank-you">Thank you</option>
                </select>
                <input
                  value={flowerForm.image}
                  onChange={(event) =>
                    setFlowerForm((current) => ({
                      ...current,
                      image: event.target.value
                    }))
                  }
                  placeholder="Image URL"
                />
                <textarea
                  value={flowerForm.description}
                  onChange={(event) =>
                    setFlowerForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  placeholder="Description"
                />
                <button type="submit">Save flower</button>
              </form>
            ) : (
              <p className="guardText">Admin role required to add or edit flowers.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Recent Orders (Admin)</h2>
          {!isAdmin ? (
            <p className="guardText">Admin role required to view order history.</p>
          ) : orders.length === 0 ? (
            <p>No orders yet.</p>
          ) : (
            <div className="orders">
              {orders.map((order) => (
                <article key={order.id} className="orderCard">
                  <div className="row">
                    <strong>#{order.id}</strong>
                    <span>{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                  <p>
                    {order.customer.name} - {order.customer.email}
                  </p>
                  <p>{order.items.length} item(s)</p>
                  <p className="total">{currency(order.total)}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

