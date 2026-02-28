import { useEffect, useMemo, useState } from "react";
import {
  createFlower,
  createOrder,
  deleteFlower,
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

const occasionTabs = [
  { label: "All", value: "all" },
  { label: "Romance", value: "romance" },
  { label: "Birthday", value: "birthday" },
  { label: "Wedding", value: "wedding" },
  { label: "Thank You", value: "thank-you" },
  { label: "General", value: "general" }
];

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function float(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function iconForOccasion(occasion) {
  const map = {
    romance: "R",
    birthday: "B",
    wedding: "W",
    "thank-you": "T",
    general: "G"
  };
  return map[occasion] || "F";
}

function FlowerCard({ flower, onAdd }) {
  const hasImage = Boolean(flower.image);
  return (
    <article className="product-card">
      <div
        className="product-image"
        style={
          hasImage
            ? {
                backgroundImage: `url(${flower.image})`
              }
            : undefined
        }
      >
        {!hasImage ? <span className="product-letter">{iconForOccasion(flower.occasion)}</span> : null}
        {flower.stock < 5 ? <div className="product-badge sale">Low Stock</div> : null}
      </div>
      <div className="product-info">
        <h3 className="product-name">{flower.name}</h3>
        <p className="product-desc">{flower.description || "Seasonal fresh floral arrangement."}</p>
        <div className="product-footer">
          <div className="product-price">{currency(flower.price)}</div>
          <button
            className="add-btn"
            type="button"
            disabled={flower.stock <= 0}
            onClick={() => onAdd(flower)}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [flowers, setFlowers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState("");
  const [occasionFilter, setOccasionFilter] = useState("all");
  const [loadingFlowers, setLoadingFlowers] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [deletingFlowerId, setDeletingFlowerId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [flowerForm, setFlowerForm] = useState(initialFlowerForm);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [toast, setToast] = useState("");

  const isAdmin = user?.role === "admin";
  const canCheckout = user?.role === "admin" || user?.role === "customer";

  const featuredFlowers = useMemo(() => flowers.slice(0, 4), [flowers]);

  const visibleFlowers = useMemo(() => {
    const searchQuery = normalizedText(search);
    const selectedOccasion = normalizedText(occasionFilter);

    return flowers.filter((flower) => {
      const nameMatch = normalizedText(flower.name).includes(searchQuery);
      const descMatch = normalizedText(flower.description).includes(searchQuery);
      const searchMatch = !searchQuery || nameMatch || descMatch;
      const occasionMatch =
        selectedOccasion === "all" || normalizedText(flower.occasion) === selectedOccasion;
      return searchMatch && occasionMatch;
    });
  }, [flowers, search, occasionFilter]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([flowerId, quantity]) => {
          const flower = flowers.find((item) => item.id === flowerId);
          if (!flower) {
            return null;
          }
          return {
            flowerId,
            quantity,
            flower,
            lineTotal: float(flower.price) * quantity
          };
        })
        .filter(Boolean),
    [cart, flowers]
  );

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const dashboardStats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + float(order.total), 0);
    const stockTotal = flowers.reduce((sum, flower) => sum + Number(flower.stock || 0), 0);
    const lowStock = flowers.filter((flower) => Number(flower.stock || 0) < 5).length;
    return {
      revenue,
      orderCount: orders.length,
      stockTotal,
      lowStock
    };
  }, [orders, flowers]);

  const showToast = (message) => {
    setToast(message);
  };

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const refreshSession = async () => {
    setSessionLoading(true);
    try {
      const response = await getSession();
      setUser(response.user || null);
    } catch {
      setUser(null);
    } finally {
      setSessionLoading(false);
    }
  };

  const refreshFlowers = async () => {
    setLoadingFlowers(true);
    try {
      const response = await getFlowers();
      setFlowers(response);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoadingFlowers(false);
    }
  };

  const refreshOrders = async () => {
    if (!isAdmin) {
      setOrders([]);
      return;
    }

    try {
      const response = await getOrders();
      setOrders(response);
    } catch (error) {
      showToast(error.message);
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

  useEffect(() => {
    if (!user?.email) {
      return;
    }

    setCheckoutForm((previous) => ({
      ...previous,
      email: previous.email || user.email
    }));
  }, [user]);

  const adjustCart = (flower, delta) => {
    setCart((previous) => {
      const currentQty = Number(previous[flower.id] || 0);
      const nextQty = currentQty + delta;

      if (nextQty <= 0) {
        const { [flower.id]: _removed, ...rest } = previous;
        return rest;
      }

      if (nextQty > Number(flower.stock || 0)) {
        return previous;
      }

      return {
        ...previous,
        [flower.id]: nextQty
      };
    });
  };

  const addToCart = (flower) => {
    if (Number(flower.stock || 0) <= 0) {
      showToast("This flower is out of stock.");
      return;
    }

    const currentQty = Number(cart[flower.id] || 0);
    if (currentQty >= Number(flower.stock || 0)) {
      showToast("You reached current stock limit.");
      return;
    }

    adjustCart(flower, 1);
    showToast(`${flower.name} added to cart.`);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const response = await login(loginForm);
      setUser(response.user);
      setAuthOpen(false);
      setLoginForm(initialLoginForm);
      showToast(`Signed in as ${response.user.role}.`);
    } catch (error) {
      showToast(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Best effort logout.
    }

    setUser(null);
    setOrders([]);
    showToast("Logged out.");
  };

  const handlePlaceOrder = async (event) => {
    event.preventDefault();

    if (!canCheckout) {
      showToast("Sign in as customer or admin to place orders.");
      setAuthOpen(true);
      return;
    }

    if (cartItems.length === 0) {
      showToast("Your cart is empty.");
      return;
    }

    if (
      !checkoutForm.name.trim() ||
      !checkoutForm.email.trim() ||
      !checkoutForm.address.trim()
    ) {
      showToast("Complete customer details before checkout.");
      return;
    }

    setSubmittingOrder(true);
    try {
      await createOrder({
        customer: {
          name: checkoutForm.name.trim(),
          email: checkoutForm.email.trim(),
          address: checkoutForm.address.trim()
        },
        items: cartItems.map((item) => ({
          flowerId: item.flowerId,
          quantity: item.quantity
        }))
      });

      setCart({});
      setCheckoutForm((previous) => ({
        ...initialCheckoutForm,
        email: user?.email || ""
      }));
      showToast("Order placed successfully.");
      refreshFlowers();
      if (isAdmin) {
        refreshOrders();
      }
    } catch (error) {
      showToast(error.message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleCreateFlower = async (event) => {
    event.preventDefault();

    try {
      await createFlower({
        name: flowerForm.name.trim(),
        description: flowerForm.description.trim(),
        price: Number(flowerForm.price),
        occasion: flowerForm.occasion,
        image: flowerForm.image.trim(),
        stock: Number(flowerForm.stock)
      });
      setFlowerForm(initialFlowerForm);
      showToast("Flower added.");
      refreshFlowers();
    } catch (error) {
      showToast(error.message);
    }
  };

  const handleDeleteFlower = async (flower) => {
    const confirmed = window.confirm(`Remove "${flower.name}" from inventory?`);
    if (!confirmed) {
      return;
    }

    setDeletingFlowerId(flower.id);
    try {
      await deleteFlower(flower.id);
      setCart((previous) => {
        const { [flower.id]: _removed, ...rest } = previous;
        return rest;
      });
      showToast("Flower removed.");
      refreshFlowers();
    } catch (error) {
      showToast(error.message);
    } finally {
      setDeletingFlowerId("");
    }
  };

  return (
    <div className="site-shell">
      <nav className="top-nav">
        <button className="logo" type="button" onClick={() => setActivePage("home")}>
          Bl<span>oo</span>m
        </button>

        <div className="nav-links">
          <button type="button" onClick={() => setActivePage("home")}>
            Home
          </button>
          <button type="button" onClick={() => setActivePage("shop")}>
            Shop
          </button>
          <button type="button" onClick={() => setActivePage("admin")}>
            Admin
          </button>
        </div>

        <div className="nav-actions">
          {sessionLoading ? (
            <span className="session-note">Checking session...</span>
          ) : user ? (
            <div className="session-box">
              <span className="session-email">{user.email}</span>
              <span className="session-role">{user.role}</span>
              <button className="btn-ghost small" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <button className="btn-ghost small" type="button" onClick={() => setAuthOpen(true)}>
              Sign In
            </button>
          )}

          <button className="cart-btn" type="button" onClick={() => setCartOpen(true)}>
            Cart
            <span className="cart-count">{cartCount}</span>
          </button>
        </div>
      </nav>

      {activePage === "home" ? (
        <section className="hero">
          <div className="hero-left">
            <p className="hero-tag">Spring 2026 Collection</p>
            <h1 className="hero-title">
              Where <em>flowers</em> tell your story
            </h1>
            <p className="hero-desc">
              Handcrafted bouquets, seasonal arrangements, and living gifts sourced and
              designed with care.
            </p>
            <div className="hero-cta">
              <button className="btn-primary" type="button" onClick={() => setActivePage("shop")}>
                Shop Collection
              </button>
              <button className="btn-ghost" type="button" onClick={() => setActivePage("admin")}>
                Dashboard
              </button>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-badge">
              <div className="hero-number">{flowers.length}</div>
              <div className="hero-label">Flower Types Available</div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="marquee-wrap">
        <div className="marquee-inner">
          <span>Same-day delivery</span>
          <span>Premium quality</span>
          <span>Sustainable sourcing</span>
          <span>Custom arrangements</span>
          <span>Secure checkout</span>
          <span>Same-day delivery</span>
          <span>Premium quality</span>
          <span>Sustainable sourcing</span>
          <span>Custom arrangements</span>
          <span>Secure checkout</span>
        </div>
      </div>

      <main>
        {activePage === "home" ? (
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">
                Featured <em>Arrangements</em>
              </h2>
              <button className="view-all" type="button" onClick={() => setActivePage("shop")}>
                View All
              </button>
            </div>

            {loadingFlowers ? <p className="loading-note">Loading flowers...</p> : null}

            <div className="products-grid">
              {featuredFlowers.map((flower) => (
                <FlowerCard key={flower.id} flower={flower} onAdd={addToCart} />
              ))}
            </div>
          </section>
        ) : null}

        {activePage === "shop" ? (
          <section className="section shop-section">
            <div className="section-header">
              <h2 className="section-title">
                Our <em>Collection</em>
              </h2>
            </div>

            <div className="search-bar">
              <input
                type="text"
                placeholder="Search flowers and arrangements..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="filter-tabs">
              {occasionTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`filter-tab ${occasionFilter === tab.value ? "active" : ""}`}
                  onClick={() => setOccasionFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loadingFlowers ? <p className="loading-note">Loading flowers...</p> : null}
            {!loadingFlowers && visibleFlowers.length === 0 ? (
              <p className="loading-note">No flowers match your search.</p>
            ) : null}

            <div className="products-grid">
              {visibleFlowers.map((flower) => (
                <FlowerCard key={flower.id} flower={flower} onAdd={addToCart} />
              ))}
            </div>
          </section>
        ) : null}

        {activePage === "admin" ? (
          <section className="section admin-section">
            <div className="section-header">
              <h2 className="section-title">
                Admin <em>Dashboard</em>
              </h2>
            </div>

            {!isAdmin ? (
              <div className="guard-card">
                <p>Admin role required to manage inventory and view orders.</p>
                <button className="btn-primary" type="button" onClick={() => setAuthOpen(true)}>
                  Login as Admin
                </button>
              </div>
            ) : (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{currency(dashboardStats.revenue)}</div>
                    <div className="stat-label">Revenue</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{dashboardStats.orderCount}</div>
                    <div className="stat-label">Orders</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{flowers.length}</div>
                    <div className="stat-label">Products</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{dashboardStats.lowStock}</div>
                    <div className="stat-label">Low Stock</div>
                  </div>
                </div>

                <div className="admin-panels">
                  <div className="admin-card">
                    <h3>Inventory</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Occasion</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flowers.map((flower) => (
                            <tr key={flower.id}>
                              <td>{flower.name}</td>
                              <td>{flower.occasion}</td>
                              <td>{currency(flower.price)}</td>
                              <td>{flower.stock}</td>
                              <td className="table-action-cell">
                                <button
                                  type="button"
                                  className="danger-btn"
                                  disabled={deletingFlowerId === flower.id}
                                  onClick={() => handleDeleteFlower(flower)}
                                >
                                  {deletingFlowerId === flower.id ? "Removing..." : "Remove"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="admin-card">
                    <h3>Add Flower</h3>
                    <form className="form-grid" onSubmit={handleCreateFlower}>
                      <input
                        placeholder="Flower name"
                        value={flowerForm.name}
                        onChange={(event) =>
                          setFlowerForm((previous) => ({
                            ...previous,
                            name: event.target.value
                          }))
                        }
                        required
                      />
                      <input
                        placeholder="Price"
                        type="number"
                        min="1"
                        step="0.01"
                        value={flowerForm.price}
                        onChange={(event) =>
                          setFlowerForm((previous) => ({
                            ...previous,
                            price: event.target.value
                          }))
                        }
                        required
                      />
                      <input
                        placeholder="Stock"
                        type="number"
                        min="0"
                        value={flowerForm.stock}
                        onChange={(event) =>
                          setFlowerForm((previous) => ({
                            ...previous,
                            stock: event.target.value
                          }))
                        }
                        required
                      />
                      <select
                        value={flowerForm.occasion}
                        onChange={(event) =>
                          setFlowerForm((previous) => ({
                            ...previous,
                            occasion: event.target.value
                          }))
                        }
                      >
                        <option value="general">General</option>
                        <option value="romance">Romance</option>
                        <option value="birthday">Birthday</option>
                        <option value="wedding">Wedding</option>
                        <option value="thank-you">Thank You</option>
                      </select>
                      <input
                        placeholder="Image URL"
                        value={flowerForm.image}
                        onChange={(event) =>
                          setFlowerForm((previous) => ({
                            ...previous,
                            image: event.target.value
                          }))
                        }
                      />
                      <textarea
                        placeholder="Description"
                        value={flowerForm.description}
                        onChange={(event) =>
                          setFlowerForm((previous) => ({
                            ...previous,
                            description: event.target.value
                          }))
                        }
                      />
                      <button className="btn-primary" type="submit">
                        Save Flower
                      </button>
                    </form>
                  </div>

                  <div className="admin-card">
                    <h3>Recent Orders</h3>
                    <div className="orders-list">
                      {orders.length === 0 ? <p>No orders yet.</p> : null}
                      {orders.slice(0, 8).map((order) => (
                        <div key={order.id} className="order-row">
                          <div>
                            <strong>#{order.id}</strong>
                            <p>{order.customer.name}</p>
                          </div>
                          <div className="order-total">{currency(order.total)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>

      <div className={`cart-overlay ${cartOpen ? "open" : ""}`} onClick={() => setCartOpen(false)}>
        <aside className="cart-sidebar" onClick={(event) => event.stopPropagation()}>
          <div className="cart-header">
            <h3>Your Cart</h3>
            <button type="button" className="icon-btn" onClick={() => setCartOpen(false)}>
              x
            </button>
          </div>

          <div className="cart-items">
            {cartItems.length === 0 ? <p className="empty-note">Your cart is empty.</p> : null}
            {cartItems.map((item) => (
              <div key={item.flowerId} className="cart-item">
                <div className="cart-item-main">
                  <div className="cart-item-name">{item.flower.name}</div>
                  <div className="cart-item-price">{currency(item.lineTotal)}</div>
                </div>
                <div className="cart-qty">
                  <button type="button" onClick={() => adjustCart(item.flower, -1)}>
                    -
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => adjustCart(item.flower, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-footer">
            <div className="cart-total">
              <span>Total</span>
              <strong>{currency(cartTotal)}</strong>
            </div>

            {!canCheckout ? (
              <div className="guard-card compact">
                <p>Login as customer or admin to place order.</p>
                <button className="btn-primary" type="button" onClick={() => setAuthOpen(true)}>
                  Sign In
                </button>
              </div>
            ) : (
              <form className="form-grid" onSubmit={handlePlaceOrder}>
                <input
                  placeholder="Full name"
                  value={checkoutForm.name}
                  onChange={(event) =>
                    setCheckoutForm((previous) => ({
                      ...previous,
                      name: event.target.value
                    }))
                  }
                  required
                />
                <input
                  placeholder="Email"
                  type="email"
                  value={checkoutForm.email}
                  onChange={(event) =>
                    setCheckoutForm((previous) => ({
                      ...previous,
                      email: event.target.value
                    }))
                  }
                  required
                />
                <textarea
                  placeholder="Delivery address"
                  value={checkoutForm.address}
                  onChange={(event) =>
                    setCheckoutForm((previous) => ({
                      ...previous,
                      address: event.target.value
                    }))
                  }
                  required
                />
                <button className="btn-primary" type="submit" disabled={submittingOrder}>
                  {submittingOrder ? "Placing..." : "Place Order"}
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>

      <div className={`modal-overlay ${authOpen ? "open" : ""}`} onClick={() => setAuthOpen(false)}>
        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-btn top-right" onClick={() => setAuthOpen(false)}>
            x
          </button>
          <h3>Sign In</h3>
          <p>Use your configured role credentials.</p>
          <form className="form-grid" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={loginForm.email}
              onChange={(event) =>
                setLoginForm((previous) => ({
                  ...previous,
                  email: event.target.value
                }))
              }
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((previous) => ({
                  ...previous,
                  password: event.target.value
                }))
              }
              required
            />
            <button className="btn-primary" type="submit">
              Login
            </button>
          </form>
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
