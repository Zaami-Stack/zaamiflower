import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  createFlower,
  createNotification,
  createOrder,
  deleteNotification,
  deleteFlower,
  getFlowers,
  getNotifications,
  getOrders,
  getSiteSettings,
  getSession,
  login,
  signup,
  logout,
  updateFlower,
  updateOrderStatus,
  updateSiteSettings
} from "./api";

const initialFlowerForm = {
  name: "",
  description: "",
  price: "",
  occasion: "general",
  image: "",
  imageFocusX: 50,
  imageFocusY: 50,
  stock: 0
};

const initialCheckoutForm = {
  name: "",
  email: "",
  phone: "",
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

const initialNotificationForm = {
  title: "",
  message: ""
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
const WHATSAPP_CHAT_URL = "https://wa.me/212775094615";
const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80";
const marqueeHighlights = [
  "Same-day delivery",
  "Premium quality",
  "Sustainable sourcing",
  "Custom arrangements",
  "Secure checkout"
];
const USD_TO_MAD_RATE = 10;
const NOTIFICATION_SEEN_STORAGE_KEY = "flyethr_notifications_seen_at";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,24}$/;
const currencyOptions = {
  USD: {
    label: "USD ($)",
    locale: "en-US",
    currency: "USD",
    rate: 1
  },
  MAD: {
    label: "MAD (DH)",
    locale: "fr-MA",
    currency: "MAD",
    rate: USD_TO_MAD_RATE
  }
};
gsap.registerPlugin(ScrollTrigger);

function float(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
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

function flowerObjectPosition(flower) {
  const focusX = Number(flower?.imageFocusX);
  const focusY = Number(flower?.imageFocusY);
  const safeX = Number.isFinite(focusX) ? Math.min(100, Math.max(0, focusX)) : 50;
  const safeY = Number.isFinite(focusY) ? Math.min(100, Math.max(0, focusY)) : 50;
  return `${safeX}% ${safeY}%`;
}

function normalizePaymentStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "failed") {
    return normalized;
  }
  return "pending";
}

function paymentStatusLabel(status) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === "paid") {
    return "Paid";
  }
  if (normalized === "failed") {
    return "Failed";
  }
  return "Pending";
}

function isValidPhone(value) {
  const normalized = String(value || "").trim();
  if (!PHONE_REGEX.test(normalized)) {
    return false;
  }
  const digits = normalized.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

function isValidHttpImageUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeFlowerModel(flower) {
  return {
    ...flower,
    imageFocusX: Number.isFinite(Number(flower?.imageFocusX)) ? Number(flower.imageFocusX) : 50,
    imageFocusY: Number.isFinite(Number(flower?.imageFocusY)) ? Number(flower.imageFocusY) : 50
  };
}

function normalizeOrderModel(order) {
  return {
    ...order,
    paymentMethod: order?.paymentMethod === "paypal" ? "paypal" : "cash",
    paymentStatus: normalizePaymentStatus(order?.paymentStatus),
    customer: {
      name: String(order?.customer?.name || "").trim(),
      email: String(order?.customer?.email || "").trim(),
      phone: String(order?.customer?.phone || "").trim(),
      address: String(order?.customer?.address || "").trim()
    }
  };
}

function FlowerCard({ flower, onAdd, formatCurrency }) {
  const hasImage = Boolean(flower.image);
  return (
    <article className="product-card">
      <div className="product-image">
        {hasImage ? (
          <img
            className="product-image-media"
            src={flower.image}
            alt={flower.name}
            style={{ objectPosition: flowerObjectPosition(flower) }}
            loading="lazy"
          />
        ) : null}
        {!hasImage ? <span className="product-letter">{iconForOccasion(flower.occasion)}</span> : null}
        {flower.stock < 5 ? <div className="product-badge sale">Low Stock</div> : null}
      </div>
      <div className="product-info">
        <h3 className="product-name">{flower.name}</h3>
        <p className="product-desc">{flower.description || "Seasonal fresh floral arrangement."}</p>
        <div className="product-footer">
          <div className="product-price">{formatCurrency(flower.price)}</div>
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

function ProductCardSkeleton({ index }) {
  return (
    <article className="product-card product-card-skeleton" aria-hidden="true">
      <div className="product-image product-image-skeleton" />
      <div className="product-info">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
      <span className="sr-only">Loading flower {index + 1}</span>
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
  const lenisRef = useRef(null);
  const cartSidebarRef = useRef(null);
  const authModalRef = useRef(null);

  const [flowers, setFlowers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState("");
  const [occasionFilter, setOccasionFilter] = useState("all");
  const [loadingFlowers, setLoadingFlowers] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [deletingFlowerId, setDeletingFlowerId] = useState("");
  const [editingFlowerId, setEditingFlowerId] = useState("");
  const [savingFlower, setSavingFlower] = useState(false);
  const [bulkStockDelta, setBulkStockDelta] = useState("");
  const [bulkStockOccasion, setBulkStockOccasion] = useState("all");
  const [applyingBulkStock, setApplyingBulkStock] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [flowerForm, setFlowerForm] = useState(initialFlowerForm);
  const [siteSettings, setSiteSettings] = useState({
    heroImage: DEFAULT_HERO_IMAGE,
    updatedAt: ""
  });
  const [heroImageForm, setHeroImageForm] = useState(DEFAULT_HERO_IMAGE);
  const [savingHeroImage, setSavingHeroImage] = useState(false);
  const [notificationForm, setNotificationForm] = useState(initialNotificationForm);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [submittingNotification, setSubmittingNotification] = useState(false);
  const [deletingNotificationId, setDeletingNotificationId] = useState("");
  const [seenNotificationAt, setSeenNotificationAt] = useState(() => {
    if (typeof window === "undefined") {
      return 0;
    }

    const stored = Number(window.localStorage.getItem(NOTIFICATION_SEEN_STORAGE_KEY));
    return Number.isFinite(stored) ? stored : 0;
  });
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
  const formatCurrency = useMemo(() => {
    const selected = currencyOptions[currencyCode] || currencyOptions.USD;
    const formatter = new Intl.NumberFormat(selected.locale, {
      style: "currency",
      currency: selected.currency
    });

    return (value) => formatter.format(float(value) * selected.rate);
  }, [currencyCode]);
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

  const latestNotificationAt = useMemo(
    () => notifications.reduce((max, item) => Math.max(max, toTimestamp(item.createdAt)), 0),
    [notifications]
  );

  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => toTimestamp(item.createdAt) > seenNotificationAt).length,
    [notifications, seenNotificationAt]
  );
  const latestNotification = useMemo(
    () => (notifications.length > 0 ? notifications[0] : null),
    [notifications]
  );

  const formatNotificationDate = (value) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));

  const showToast = (message) => {
    setToast(message);
  };

  const scrollToSection = (ref) => {
    if (!ref.current) {
      return;
    }

    if (lenisRef.current) {
      lenisRef.current.scrollTo(ref.current, {
        offset: -96,
        duration: 1.1
      });
      return;
    }

    ref.current.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const navigateToSection = (ref) => {
    scrollToSection(ref);
    setMenuOpen(false);
    setNotificationsOpen(false);
  };

  const openCart = () => {
    setCartOpen(true);
    setMenuOpen(false);
    setNotificationsOpen(false);
  };

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.1,
      easing: (t) => 1 - Math.pow(1 - t, 4)
    });

    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.off("scroll", ScrollTrigger.update);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

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

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(".hero-image", {
        y: -10,
        scale: 1.07,
        duration: 4.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true
      });

      gsap.to(".hero-badge", {
        y: -8,
        duration: 2.6,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true
      });
    });

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".section-header").forEach((header) => {
        gsap.fromTo(
          header,
          { y: 18, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: {
              trigger: header,
              start: "top 86%",
              once: true
            }
          }
        );
      });

      [".about-card", ".stat-card", ".admin-card", ".order-row"].forEach((selector) => {
        gsap.utils.toArray(selector).forEach((node) => {
          gsap.fromTo(
            node,
            { y: 24, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.6,
              ease: "power2.out",
              scrollTrigger: {
                trigger: node,
                start: "top 90%",
                once: true
              }
            }
          );
        });
      });

      if (document.querySelector(".marquee-wrap")) {
        gsap.fromTo(
          ".marquee-wrap",
          { y: 12, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.65,
            ease: "power2.out",
            scrollTrigger: {
              trigger: ".marquee-wrap",
              start: "top 98%",
              once: true
            }
          }
        );
      }
    });

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [isAdmin, orders.length, flowers.length]);

  useEffect(() => {
    if (!cartOpen || !cartSidebarRef.current) {
      return undefined;
    }

    const tween = gsap.fromTo(
      cartSidebarRef.current.querySelectorAll(".cart-header, .cart-items-panel, .cart-checkout-panel"),
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power2.out" }
    );

    return () => tween.kill();
  }, [cartOpen, cartItems.length]);

  useEffect(() => {
    if (!authOpen || !authModalRef.current) {
      return undefined;
    }

    const tween = gsap.fromTo(
      authModalRef.current,
      { y: 18, opacity: 0, scale: 0.985 },
      { y: 0, opacity: 1, scale: 1, duration: 0.36, ease: "power2.out" }
    );

    return () => tween.kill();
  }, [authOpen, authMode]);

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
      setFlowers(Array.isArray(response) ? response.map((flower) => normalizeFlowerModel(flower)) : []);
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
      setOrders(Array.isArray(response) ? response.map((order) => normalizeOrderModel(order)) : []);
    } catch (error) {
      showToast(error.message);
      setOrders([]);
    }
  };

  const refreshNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const response = await getNotifications(30);
      setNotifications(Array.isArray(response) ? response : []);
    } catch (error) {
      setNotifications([]);
      setNotificationsError(error.message || "Failed to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const refreshSiteSettings = async () => {
    try {
      const response = await getSiteSettings();
      const heroImage = isValidHttpImageUrl(response?.heroImage)
        ? String(response.heroImage).trim()
        : DEFAULT_HERO_IMAGE;
      setSiteSettings({
        heroImage,
        updatedAt: response?.updatedAt || ""
      });
      setHeroImageForm(heroImage);
    } catch {
      setSiteSettings((previous) => ({
        ...previous,
        heroImage: previous.heroImage || DEFAULT_HERO_IMAGE
      }));
    }
  };

  useEffect(() => {
    refreshSession();
    refreshFlowers();
    refreshNotifications();
    refreshSiteSettings();
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      refreshNotifications();
    }, 20000);

    return () => clearInterval(poll);
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(NOTIFICATION_SEEN_STORAGE_KEY, String(seenNotificationAt));
  }, [seenNotificationAt]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    if (latestNotificationAt > seenNotificationAt) {
      setSeenNotificationAt(latestNotificationAt);
    }
  }, [notificationsOpen, latestNotificationAt, seenNotificationAt]);

  const openAuth = (mode = "login") => {
    setMenuOpen(false);
    setNotificationsOpen(false);
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
    setNotificationsOpen(false);
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
      !checkoutForm.phone.trim() ||
      !checkoutForm.address.trim()
    ) {
      showToast("Complete customer details before checkout.");
      return;
    }

    if (!EMAIL_REGEX.test(checkoutForm.email.trim())) {
      showToast("Please enter a valid email address.");
      return;
    }

    if (!isValidPhone(checkoutForm.phone.trim())) {
      showToast("Please enter a valid phone number.");
      return;
    }

    if (checkoutForm.address.trim().length < 6) {
      showToast("Delivery address must be at least 6 characters.");
      return;
    }

    setSubmittingOrder(true);
    try {
      await createOrder({
        customer: {
          name: checkoutForm.name.trim(),
          email: checkoutForm.email.trim(),
          phone: checkoutForm.phone.trim(),
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
      showToast("Order created with payment status: Pending.");
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

  const startEditingFlower = (flower) => {
    setEditingFlowerId(flower.id);
    setFlowerForm({
      name: flower.name || "",
      description: flower.description || "",
      price: String(flower.price ?? ""),
      occasion: flower.occasion || "general",
      image: flower.image || "",
      imageFocusX: Number.isFinite(Number(flower.imageFocusX)) ? Number(flower.imageFocusX) : 50,
      imageFocusY: Number.isFinite(Number(flower.imageFocusY)) ? Number(flower.imageFocusY) : 50,
      stock: Number.isFinite(Number(flower.stock)) ? Number(flower.stock) : 0
    });
  };

  const cancelEditingFlower = () => {
    setEditingFlowerId("");
    setFlowerForm(initialFlowerForm);
  };

  const handleSaveFlower = async (event) => {
    event.preventDefault();

    const payload = {
      name: flowerForm.name.trim(),
      description: flowerForm.description.trim(),
      price: Number(flowerForm.price),
      occasion: flowerForm.occasion,
      image: flowerForm.image.trim(),
      imageFocusX: Number(flowerForm.imageFocusX),
      imageFocusY: Number(flowerForm.imageFocusY),
      stock: Number(flowerForm.stock)
    };

    if (payload.name.length < 2) {
      showToast("Flower name must be at least 2 characters.");
      return;
    }

    if (!Number.isFinite(payload.price) || payload.price <= 0) {
      showToast("Price must be greater than 0.");
      return;
    }

    if (!Number.isInteger(payload.stock) || payload.stock < 0) {
      showToast("Stock must be a whole number (0 or more).");
      return;
    }

    if (!Number.isFinite(payload.imageFocusX) || payload.imageFocusX < 0 || payload.imageFocusX > 100) {
      showToast("Image focus X must be between 0 and 100.");
      return;
    }

    if (!Number.isFinite(payload.imageFocusY) || payload.imageFocusY < 0 || payload.imageFocusY > 100) {
      showToast("Image focus Y must be between 0 and 100.");
      return;
    }

    setSavingFlower(true);
    try {
      if (editingFlowerId) {
        await updateFlower(editingFlowerId, payload);
        showToast("Flower updated.");
      } else {
        await createFlower(payload);
        showToast("Flower added.");
      }
      setFlowerForm(initialFlowerForm);
      setEditingFlowerId("");
      refreshFlowers();
    } catch (error) {
      showToast(error.message);
    } finally {
      setSavingFlower(false);
    }
  };

  const handleBulkStockUpdate = async (event) => {
    event.preventDefault();
    const delta = Number(bulkStockDelta);

    if (!Number.isInteger(delta) || delta === 0) {
      showToast("Enter a whole number (not 0) for stock change.");
      return;
    }

    const targets = flowers.filter((flower) =>
      bulkStockOccasion === "all" ? true : flower.occasion === bulkStockOccasion
    );

    if (targets.length === 0) {
      showToast("No flowers found for that occasion.");
      return;
    }

    setApplyingBulkStock(true);
    try {
      await Promise.all(
        targets.map((flower) =>
          updateFlower(flower.id, {
            stock: Math.max(0, Number(flower.stock || 0) + delta)
          })
        )
      );
      setBulkStockDelta("");
      showToast(`Stock updated for ${targets.length} flowers.`);
      refreshFlowers();
    } catch (error) {
      showToast(error.message);
    } finally {
      setApplyingBulkStock(false);
    }
  };

  const handleSaveHeroImage = async (event) => {
    event.preventDefault();
    const heroImage = String(heroImageForm || "").trim();

    if (!isValidHttpImageUrl(heroImage)) {
      showToast("Enter a valid http/https image URL.");
      return;
    }

    setSavingHeroImage(true);
    try {
      const response = await updateSiteSettings({ heroImage });
      const normalizedImage = isValidHttpImageUrl(response?.heroImage)
        ? String(response.heroImage).trim()
        : heroImage;
      setSiteSettings({
        heroImage: normalizedImage,
        updatedAt: response?.updatedAt || new Date().toISOString()
      });
      setHeroImageForm(normalizedImage);
      showToast("Hero image updated.");
    } catch (error) {
      showToast(error.message);
    } finally {
      setSavingHeroImage(false);
    }
  };

  const handleUpdateOrderPaymentStatus = async (order, nextStatus) => {
    if (normalizePaymentStatus(order.paymentStatus) === normalizePaymentStatus(nextStatus)) {
      return;
    }

    setUpdatingOrderId(order.id);
    try {
      const updated = await updateOrderStatus(order.id, nextStatus);
      setOrders((previous) =>
        previous.map((item) =>
          item.id === order.id ? normalizeOrderModel(updated) : normalizeOrderModel(item)
        )
      );
      showToast(`Order #${order.id} marked ${paymentStatusLabel(nextStatus)}.`);
    } catch (error) {
      showToast(error.message);
    } finally {
      setUpdatingOrderId("");
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

  const toggleNotifications = () => {
    setCartOpen(false);
    setNotificationsOpen((previous) => !previous);
    setMenuOpen(false);
  };

  const handleCreateNotification = async (event) => {
    event.preventDefault();

    const title = notificationForm.title.trim();
    const message = notificationForm.message.trim();

    if (!title) {
      showToast("Promo title is required.");
      return;
    }

    setSubmittingNotification(true);
    try {
      await createNotification({ title, message });
      setNotificationForm(initialNotificationForm);
      showToast("Promo notification published.");
      refreshNotifications();
    } catch (error) {
      showToast(error.message);
    } finally {
      setSubmittingNotification(false);
    }
  };

  const handleDeleteNotification = async (notification) => {
    const confirmed = window.confirm(`Remove promo "${notification.title}"?`);
    if (!confirmed) {
      return;
    }

    setDeletingNotificationId(notification.id);
    try {
      await deleteNotification(notification.id);
      showToast("Promo notification removed.");
      refreshNotifications();
    } catch (error) {
      showToast(error.message);
    } finally {
      setDeletingNotificationId("");
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

        <button
          className="cart-btn cart-btn-mobile"
          type="button"
          aria-label={
            cartCount > 0 ? `Open cart, ${cartCount} item${cartCount === 1 ? "" : "s"}` : "Open cart"
          }
          onClick={openCart}
        >
          <span className="cart-icon-wrap">
            <img className="cart-icon" src="/bag.svg" alt="" aria-hidden="true" />
            {cartCount > 0 ? <span className="cart-dot" aria-hidden="true" /> : null}
          </span>
        </button>

        <button
          className="notify-btn notify-btn-mobile"
          type="button"
          aria-label={
            unreadNotificationCount > 0
              ? `Open promotions, ${unreadNotificationCount} new`
              : "Open promotions"
          }
          onClick={toggleNotifications}
        >
          <span className="notify-icon-wrap">
            <img className="notify-icon" src="/bell-fill.svg" alt="" aria-hidden="true" />
            {unreadNotificationCount > 0 ? <span className="notify-dot" aria-hidden="true" /> : null}
          </span>
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
              href={WHATSAPP_CHAT_URL}
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
            <label className="currency-switch" htmlFor="currency-select">
              <span>Currency</span>
              <select
                id="currency-select"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
              >
                {Object.entries(currencyOptions).map(([code, option]) => (
                  <option key={code} value={code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="notify-btn"
              type="button"
              aria-label={
                unreadNotificationCount > 0
                  ? `Open promotions, ${unreadNotificationCount} new`
                  : "Open promotions"
              }
              onClick={toggleNotifications}
            >
              <span className="notify-icon-wrap">
                <img className="notify-icon" src="/bell-fill.svg" alt="" aria-hidden="true" />
                {unreadNotificationCount > 0 ? <span className="notify-dot" aria-hidden="true" /> : null}
              </span>
              <span className="notify-label">Promo</span>
            </button>

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
            src={siteSettings.heroImage || DEFAULT_HERO_IMAGE}
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
        <section className="promo-highlight" aria-live="polite">
          <p className="promo-highlight-tag">Promotions</p>
          <div className="promo-highlight-main">
            <div>
              <h3>
                {notificationsLoading
                  ? "Loading promotions..."
                  : latestNotification
                    ? latestNotification.title
                    : "No active promotions right now"}
              </h3>
              {latestNotification?.message ? (
                <p>{latestNotification.message}</p>
              ) : (
                <p className="promo-highlight-note">
                  {notificationsError
                    ? "Promotions are unavailable right now. Try refreshing in a moment."
                    : "New discounts and offers will appear here."}
                </p>
              )}
            </div>
            <div className="promo-highlight-actions">
              <button className="btn-ghost small" type="button" onClick={refreshNotifications}>
                Refresh
              </button>
              <button className="btn-ghost small" type="button" onClick={toggleNotifications}>
                See All
              </button>
            </div>
          </div>
        </section>

        <section className="section scroll-section">
          <div className="section-header">
            <h2 className="section-title">
              Featured <em>Arrangements</em>
            </h2>
            <button className="view-all" type="button" onClick={() => scrollToSection(shopRef)}>
              View All
            </button>
          </div>

          <div className="products-grid featured-grid" ref={featuredGridRef}>
            {loadingFlowers
              ? Array.from({ length: 4 }).map((_, index) => (
                  <ProductCardSkeleton key={`featured-skeleton-${index}`} index={index} />
                ))
              : featuredFlowers.length === 0
                ? (
                    <div className="empty-state">
                      <strong>No featured flowers yet.</strong>
                      <p>Add flowers in admin to populate this section.</p>
                    </div>
                  )
                : featuredFlowers.map((flower) => (
                    <FlowerCard
                      key={flower.id}
                      flower={flower}
                      onAdd={addToCart}
                      formatCurrency={formatCurrency}
                    />
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

          <div className="products-grid shop-grid" ref={shopGridRef}>
            {loadingFlowers
              ? Array.from({ length: 8 }).map((_, index) => (
                  <ProductCardSkeleton key={`shop-skeleton-${index}`} index={index} />
                ))
              : visibleFlowers.length === 0
                ? (
                    <div className="empty-state">
                      <strong>No flowers match your filters.</strong>
                      <p>Try another search or select a different occasion.</p>
                    </div>
                  )
                : visibleFlowers.map((flower) => (
                    <FlowerCard
                      key={flower.id}
                      flower={flower}
                      onAdd={addToCart}
                      formatCurrency={formatCurrency}
                    />
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
              <p>For custom requests and updates, chat with us on WhatsApp.</p>
              <a className="btn-ghost about-link" href={WHATSAPP_CHAT_URL} target="_blank" rel="noreferrer">
                WhatsApp Chat
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
                  <div className="stat-value">{formatCurrency(dashboardStats.revenue)}</div>
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
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flowers.map((flower) => (
                          <tr key={flower.id}>
                            <td>{flower.name}</td>
                            <td>{flower.occasion}</td>
                            <td>{formatCurrency(flower.price)}</td>
                            <td>{flower.stock}</td>
                            <td className="table-action-cell">
                              <button
                                type="button"
                                className="btn-ghost table-btn"
                                onClick={() => startEditingFlower(flower)}
                              >
                                Edit
                              </button>
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
                  <h3>{editingFlowerId ? "Edit Flower" : "Add Flower"}</h3>
                  <form className="form-grid" onSubmit={handleSaveFlower}>
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
                      step="1"
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
                    <div className="focus-grid">
                      <label>
                        Image Focus X
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={flowerForm.imageFocusX}
                          onChange={(event) =>
                            setFlowerForm((previous) => ({
                              ...previous,
                              imageFocusX: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label>
                        Image Focus Y
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={flowerForm.imageFocusY}
                          onChange={(event) =>
                            setFlowerForm((previous) => ({
                              ...previous,
                              imageFocusY: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                    </div>
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
                    <button className="btn-primary" type="submit" disabled={savingFlower}>
                      {savingFlower ? "Saving..." : editingFlowerId ? "Save Changes" : "Save Flower"}
                    </button>
                    {editingFlowerId ? (
                      <button className="btn-ghost" type="button" onClick={cancelEditingFlower}>
                        Cancel Edit
                      </button>
                    ) : null}
                  </form>
                  <form className="form-grid bulk-stock-form" onSubmit={handleBulkStockUpdate}>
                    <h4>Bulk Stock Update</h4>
                    <select
                      value={bulkStockOccasion}
                      onChange={(event) => setBulkStockOccasion(event.target.value)}
                    >
                      {occasionTabs.map((tab) => (
                        <option key={`bulk-${tab.value}`} value={tab.value}>
                          {tab.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="1"
                      placeholder="Stock delta (e.g. 5 or -3)"
                      value={bulkStockDelta}
                      onChange={(event) => setBulkStockDelta(event.target.value)}
                    />
                    <button className="btn-primary" type="submit" disabled={applyingBulkStock}>
                      {applyingBulkStock ? "Updating..." : "Apply Stock Change"}
                    </button>
                  </form>
                </div>

                <div className="admin-card">
                  <h3>Hero Banner Image</h3>
                  <form className="form-grid" onSubmit={handleSaveHeroImage}>
                    <input
                      type="url"
                      placeholder="Hero image URL"
                      value={heroImageForm}
                      onChange={(event) => setHeroImageForm(event.target.value)}
                      required
                    />
                    <button className="btn-primary" type="submit" disabled={savingHeroImage}>
                      {savingHeroImage ? "Saving..." : "Update Hero Image"}
                    </button>
                  </form>
                  <div className="hero-settings-preview">
                    <img src={heroImageForm || siteSettings.heroImage || DEFAULT_HERO_IMAGE} alt="Hero preview" />
                  </div>
                </div>

                <div className="admin-card">
                  <h3>Promo Notifications</h3>
                  <form className="form-grid" onSubmit={handleCreateNotification}>
                    <input
                      placeholder="Promo title"
                      value={notificationForm.title}
                      onChange={(event) =>
                        setNotificationForm((previous) => ({
                          ...previous,
                          title: event.target.value
                        }))
                      }
                      required
                    />
                    <textarea
                      placeholder="Promo details (optional)"
                      value={notificationForm.message}
                      onChange={(event) =>
                        setNotificationForm((previous) => ({
                          ...previous,
                          message: event.target.value
                        }))
                      }
                    />
                    <button className="btn-primary" type="submit" disabled={submittingNotification}>
                      {submittingNotification ? "Publishing..." : "Publish Promo"}
                    </button>
                  </form>
                  <div className="promo-admin-list">
                    {notifications.length === 0 ? <p>No promos yet.</p> : null}
                    {notifications.slice(0, 6).map((notification) => (
                      <div key={notification.id} className="promo-admin-row">
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{formatNotificationDate(notification.createdAt)}</p>
                        </div>
                        <button
                          type="button"
                          className="danger-btn"
                          disabled={deletingNotificationId === notification.id}
                          onClick={() => handleDeleteNotification(notification)}
                        >
                          {deletingNotificationId === notification.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
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
                          {order.customer.phone ? <p className="order-contact">{order.customer.phone}</p> : null}
                          <p className="order-contact">Method: {order.paymentMethod === "paypal" ? "PayPal" : "Cash"}</p>
                        </div>
                        <div className="order-side">
                          <div className="order-total">{formatCurrency(order.total)}</div>
                          <div className={`status-badge ${normalizePaymentStatus(order.paymentStatus)}`}>
                            {paymentStatusLabel(order.paymentStatus)}
                          </div>
                          <select
                            className="order-status-select"
                            value={normalizePaymentStatus(order.paymentStatus)}
                            onChange={(event) => handleUpdateOrderPaymentStatus(order, event.target.value)}
                            disabled={updatingOrderId === order.id}
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="failed">Failed</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          </section>
        ) : null}
      </main>

      <div
        className={`notify-overlay ${notificationsOpen ? "open" : ""}`}
        onClick={() => setNotificationsOpen(false)}
      >
        <aside className="notify-panel" onClick={(event) => event.stopPropagation()}>
          <div className="notify-head">
            <h3>Promotions</h3>
            <button type="button" className="icon-btn" onClick={() => setNotificationsOpen(false)}>
              x
            </button>
          </div>
          <div className="notify-list">
            {notificationsLoading ? <p className="empty-note">Loading promotions...</p> : null}
            {!notificationsLoading && notificationsError ? (
              <p className="empty-note">{notificationsError}</p>
            ) : null}
            {!notificationsLoading && !notificationsError && notifications.length === 0 ? (
              <p className="empty-note">No promo notifications for now.</p>
            ) : null}
            {!notificationsLoading && !notificationsError
              ? notifications.map((notification) => (
                  <article key={notification.id} className="notify-item">
                    <h4>{notification.title}</h4>
                    {notification.message ? <p>{notification.message}</p> : null}
                    <span>{formatNotificationDate(notification.createdAt)}</span>
                  </article>
                ))
              : null}
          </div>
        </aside>
      </div>

      <div className={`cart-overlay ${cartOpen ? "open" : ""}`} onClick={() => setCartOpen(false)}>
        <aside className="cart-sidebar" ref={cartSidebarRef} onClick={(event) => event.stopPropagation()}>
          <div className="cart-header">
            <h3>Your Cart</h3>
            <button type="button" className="icon-btn" onClick={() => setCartOpen(false)}>
              x
            </button>
          </div>

          <div className="cart-body">
            <section className="cart-items-panel">
              <div className="cart-items-head">
                <span>Selected Items</span>
                <strong>{cartCount}</strong>
              </div>
              <div className="cart-items">
                {cartItems.length === 0 ? (
                  <div className="empty-state compact">
                    <strong>Your cart is empty.</strong>
                    <p>Add a bouquet from the shop to start checkout.</p>
                    <button
                      className="btn-ghost small"
                      type="button"
                      onClick={() => {
                        setCartOpen(false);
                        scrollToSection(shopRef);
                      }}
                    >
                      Browse Flowers
                    </button>
                  </div>
                ) : null}
                {cartItems.map((item) => {
                  const hasImage = Boolean(item.flower.image);
                  return (
                    <div key={item.flowerId} className="cart-item">
                      <div
                        className="cart-item-thumb"
                        style={
                          hasImage
                            ? {
                                backgroundImage: `url(${item.flower.image})`,
                                backgroundPosition: flowerObjectPosition(item.flower)
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
                          <div className="cart-item-price">{formatCurrency(item.lineTotal)}</div>
                        </div>
                        <div className="cart-item-subline">{formatCurrency(item.flower.price)} each</div>
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
            </section>

            <section className="cart-checkout-panel">
              <div className="cart-total">
                <span>Total</span>
                <strong>{formatCurrency(cartTotal)}</strong>
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
                  <input
                    placeholder="Phone number"
                    type="tel"
                    inputMode="tel"
                    value={checkoutForm.phone}
                    onChange={(event) =>
                      setCheckoutForm((previous) => ({
                        ...previous,
                        phone: event.target.value
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
                  <p className="payment-hint">
                    New orders are created as <strong>Pending</strong>. Admin can mark them as Paid or Failed.
                  </p>
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
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={submittingOrder || cartItems.length === 0}
                  >
                    {submittingOrder
                      ? "Placing..."
                      : cartItems.length === 0
                        ? "Add items to checkout"
                      : paymentMethod === "paypal"
                        ? "Place Order (PayPal selected)"
                        : "Place Order"}
                  </button>
                </form>
              )}
            </section>
          </div>
        </aside>
      </div>

      <div className={`modal-overlay ${authOpen ? "open" : ""}`} onClick={() => setAuthOpen(false)}>
        <div className="modal-card" ref={authModalRef} onClick={(event) => event.stopPropagation()}>
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
