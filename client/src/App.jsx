import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  createFlower,
  createOrder,
  deleteFlower,
  getFlowers,
  getOrders,
  getSession,
  login,
  signup,
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

const initialSignupForm = {
  name: "",
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
const PAYPAL_ME_URL = "https://paypal.me/AnasZaami";
const marqueeHighlights = [
  "Same-day delivery",
  "Premium quality",
  "Sustainable sourcing",
  "Custom arrangements",
  "Secure checkout"
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
  const homeRef = useRef(null);
  const shopRef = useRef(null);
  const aboutRef = useRef(null);
  const adminRef = useRef(null);
  const heroRef = useRef(null);
  const featuredGridRef = useRef(null);
  const shopGridRef = useRef(null);

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
  const [authMode, setAuthMode] = useState("login");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [flowerForm, setFlowerForm] = useState(initialFlowerForm);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [toast, setToast] = useState("");

  const isAdmin = user?.role === "admin";
  const canCheckout = user?.role === "admin" || user?.role === "customer";

  const featuredFlowers = useMemo(() => flowers.slice(0, 6), [flowers]);

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
  const paypalCheckoutUrl = useMemo(() => {
    const normalizedBase = PAYPAL_ME_URL.replace(/\/+$/, "");
    const amount = Number(cartTotal.toFixed(2));
    return amount > 0 ? `${normalizedBase}/${amount.toFixed(2)}` : normalizedBase;
  }, [cartTotal]);

  const dashboardStats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + float(order.total), 0);
    const lowStock = flowers.filter((flower) => Number(flower.stock || 0) < 5).length;
    return {
      revenue,
      orderCount: orders.length,
      lowStock
    };
  }, [orders, flowers]);

  const showToast = (message) => {
    setToast(message);
  };

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const navigateToSection = (ref) => {
    scrollToSection(ref);
    setMenuOpen(false);
  };

  const openCart = () => {
    setCartOpen(true);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!heroRef.current) {
        return;
      }
      gsap.fromTo(
        heroRef.current.querySelectorAll(".hero-tag, .hero-title, .hero-desc, .hero-cta"),
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.1,
          ease: "power3.out"
        }
      );
    });

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (featuredGridRef.current) {
        gsap.fromTo(
          featuredGridRef.current.querySelectorAll(".product-card"),
          { y: 18, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: "power2.out" }
        );
      }

      if (shopGridRef.current) {
        gsap.fromTo(
          shopGridRef.current.querySelectorAll(".product-card"),
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: "power2.out" }
        );
      }
    });

    return () => ctx.revert();
  }, [featuredFlowers.length, visibleFlowers.length, occasionFilter, search]);

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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 980) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const openAuth = (mode = "login") => {
    setMenuOpen(false);
    setAuthMode(mode);
    setAuthOpen(true);
  };

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
      setAuthMode("login");
      setLoginForm(initialLoginForm);
      showToast(`Signed in as ${response.user.role}.`);
    } catch (error) {
      showToast(error.message);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    try {
      const response = await signup(signupForm);
      setUser(response.user);
      setSignupForm(initialSignupForm);
      setLoginForm((previous) => ({
        ...previous,
        email: response.user.email
      }));
      setAuthOpen(false);
      setAuthMode("login");
      showToast("Account created. You are now signed in.");
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
    setMenuOpen(false);
    showToast("Logged out.");
  };

  const handlePlaceOrder = async (event) => {
    event.preventDefault();

    if (!canCheckout) {
      showToast("Sign in as customer or admin to place orders.");
      openAuth("login");
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
        paymentMethod,
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
      setPaymentMethod("cash");
      showToast(
        paymentMethod === "paypal"
          ? "Order placed. Complete the payment in PayPal."
          : "Order placed successfully."
      );
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
        <button className="logo" type="button" onClick={() => navigateToSection(homeRef)}>
          flyethr
        </button>

        <button
          className={`menu-toggle ${menuOpen ? "open" : ""}`}
          type="button"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((previous) => !previous)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`nav-menu ${menuOpen ? "open" : ""}`}>
          <div className="nav-links">
            <button type="button" onClick={() => navigateToSection(homeRef)}>
              Home
            </button>
            <button type="button" onClick={() => navigateToSection(shopRef)}>
              Shop
            </button>
            <button type="button" onClick={() => navigateToSection(aboutRef)}>
              About Us
            </button>
            <a
              href="https://www.instagram.com/yanasstack/"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Contact
            </a>
            {isAdmin ? (
              <button type="button" onClick={() => navigateToSection(adminRef)}>
                Admin
              </button>
            ) : null}
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
              <button className="btn-ghost small" type="button" onClick={() => openAuth("login")}>
                Sign In
              </button>
            )}

            <button
              className="cart-btn"
              type="button"
              aria-label={
                cartCount > 0
                  ? `Open cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`
                  : "Open cart"
              }
              onClick={openCart}
            >
              <span className="cart-icon-wrap">
                <img className="cart-icon" src="/bag.svg" alt="" aria-hidden="true" />
                {cartCount > 0 ? <span className="cart-dot" aria-hidden="true" /> : null}
              </span>
            </button>
          </div>
        </div>
      </nav>

      <section className="hero scroll-section" ref={homeRef}>
        <div className="hero-left" ref={heroRef}>
          <p className="hero-tag">Spring 2026 Collection</p>
          <h1 className="hero-title">
            Where <em>flowers</em> tell your story
          </h1>
          <p className="hero-desc">
            Handcrafted bouquets, seasonal arrangements, and living gifts sourced and designed
            with care.
          </p>
          <div className="hero-cta">
            <button className="btn-primary" type="button" onClick={() => scrollToSection(shopRef)}>
              Shop Collection
            </button>
            {isAdmin ? (
              <button className="btn-ghost" type="button" onClick={() => scrollToSection(adminRef)}>
                Dashboard
              </button>
            ) : (
              <button className="btn-ghost" type="button" onClick={() => openAuth("signup")}>
                Create Account
              </button>
            )}
          </div>
        </div>
        <div className="hero-right">
          <img
            className="hero-image"
            src="https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80"
            alt="Fresh bouquet arrangement"
            loading="lazy"
          />
          <div className="hero-badge">
            <div className="hero-number">{flowers.length}</div>
            <div className="hero-label">Flower Types Available</div>
          </div>
        </div>
      </section>

      <div className="marquee-wrap">
        <div className="marquee-track">
          <div className="marquee-inner">
            {marqueeHighlights.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="marquee-inner" aria-hidden="true">
            {marqueeHighlights.map((item) => (
              <span key={`copy-${item}`}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      <main>
        <section className="section scroll-section">
          <div className="section-header">
            <h2 className="section-title">
              Featured <em>Arrangements</em>
            </h2>
            <button className="view-all" type="button" onClick={() => scrollToSection(shopRef)}>
              View All
            </button>
          </div>

          {loadingFlowers ? <p className="loading-note">Loading flowers...</p> : null}

          <div className="products-grid featured-grid" ref={featuredGridRef}>
            {featuredFlowers.map((flower) => (
              <FlowerCard key={flower.id} flower={flower} onAdd={addToCart} />
            ))}
          </div>
        </section>

        <section className="section shop-section scroll-section" ref={shopRef}>
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

          <div className="products-grid shop-grid" ref={shopGridRef}>
            {visibleFlowers.map((flower) => (
              <FlowerCard key={flower.id} flower={flower} onAdd={addToCart} />
            ))}
          </div>
        </section>

        <section className="section about-section scroll-section" ref={aboutRef}>
          <div className="section-header">
            <h2 className="section-title">
              About <em>flyethr</em>
            </h2>
          </div>
          <div className="about-grid">
            <article className="about-card">
              <h3>Crafted With Care</h3>
              <p>
                We build modern floral arrangements for birthdays, romance, weddings, and daily
                gifts.
              </p>
            </article>
            <article className="about-card">
              <h3>Fresh Every Day</h3>
              <p>
                Bouquets are prepared from fresh seasonal flowers with clean, elegant styling.
              </p>
            </article>
            <article className="about-card">
              <h3>Contact</h3>
              <p>For custom requests and updates, contact us on Instagram.</p>
              <a className="btn-ghost about-link" href="https://www.instagram.com/yanasstack/" target="_blank" rel="noreferrer">
                @flyethr
              </a>
            </article>
          </div>
        </section>

        {isAdmin ? (
          <section className="section admin-section scroll-section" ref={adminRef}>
            <div className="section-header">
              <h2 className="section-title">
                Admin <em>Dashboard</em>
              </h2>
            </div>

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
            {cartItems.map((item) => {
              const hasImage = Boolean(item.flower.image);
              return (
                <div key={item.flowerId} className="cart-item">
                  <div
                    className="cart-item-thumb"
                    style={
                      hasImage
                        ? {
                            backgroundImage: `url(${item.flower.image})`
                          }
                        : undefined
                    }
                  >
                    {!hasImage ? (
                      <span className="cart-item-letter">{iconForOccasion(item.flower.occasion)}</span>
                    ) : null}
                  </div>
                  <div className="cart-item-content">
                    <div className="cart-item-main">
                      <div className="cart-item-name">{item.flower.name}</div>
                      <div className="cart-item-price">{currency(item.lineTotal)}</div>
                    </div>
                    <div className="cart-item-subline">{currency(item.flower.price)} each</div>
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
                </div>
              );
            })}
          </div>

          <div className="cart-footer">
            <div className="cart-total">
              <span>Total</span>
              <strong>{currency(cartTotal)}</strong>
            </div>

            {!canCheckout ? (
              <div className="guard-card compact">
                <p>Login as customer or admin to place order.</p>
                <button className="btn-primary" type="button" onClick={() => openAuth("login")}>
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
                <div className="payment-method">
                  <span className="payment-label">Payment</span>
                  <label>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={paymentMethod === "cash"}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    />
                    Cash on Delivery
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="paypal"
                      checked={paymentMethod === "paypal"}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    />
                    PayPal
                  </label>
                </div>
                {paymentMethod === "paypal" ? (
                  <a
                    className="btn-primary paypal-link"
                    href={paypalCheckoutUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pay with PayPal
                  </a>
                ) : null}
                <button className="btn-primary" type="submit" disabled={submittingOrder}>
                  {submittingOrder
                    ? "Placing..."
                    : paymentMethod === "paypal"
                      ? "Place Order (PayPal selected)"
                      : "Place Order"}
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
          {authMode === "login" ? (
            <>
              <h3>Sign In</h3>
              <p>Use your account credentials.</p>
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
              <div className="auth-switch">
                <span>New here?</span>
                <button type="button" className="link-btn" onClick={() => setAuthMode("signup")}>
                  Create account
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>Create Account</h3>
              <p>Sign up as a normal customer account.</p>
              <form className="form-grid" onSubmit={handleSignup}>
                <input
                  type="text"
                  placeholder="Full name"
                  value={signupForm.name}
                  onChange={(event) =>
                    setSignupForm((previous) => ({
                      ...previous,
                      name: event.target.value
                    }))
                  }
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={signupForm.email}
                  onChange={(event) =>
                    setSignupForm((previous) => ({
                      ...previous,
                      email: event.target.value
                    }))
                  }
                  required
                />
                <input
                  type="password"
                  placeholder="Password (min 8 chars)"
                  value={signupForm.password}
                  onChange={(event) =>
                    setSignupForm((previous) => ({
                      ...previous,
                      password: event.target.value
                    }))
                  }
                  required
                />
                <button className="btn-primary" type="submit">
                  Sign Up
                </button>
              </form>
              <div className="auth-switch">
                <span>Already have an account?</span>
                <button type="button" className="link-btn" onClick={() => setAuthMode("login")}>
                  Sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
