const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message || "Request failed");
  }

  return response.json();
}

function getFlowers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.occasion && filters.occasion !== "all") {
    params.set("occasion", filters.occasion);
  }
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));

  const query = params.toString();
  return request(`/flowers${query ? `?${query}` : ""}`);
}

function createFlower(payload) {
  return request("/flowers", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function deleteFlower(flowerId) {
  const params = new URLSearchParams({ id: flowerId });
  return request(`/flowers?${params.toString()}`, {
    method: "DELETE"
  });
}

function getOrders() {
  return request("/orders");
}

function createOrder(payload) {
  return request("/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function getNotifications(limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request(`/notifications?${params.toString()}`);
}

function createNotification(payload) {
  return request("/notifications", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function deleteNotification(notificationId) {
  const params = new URLSearchParams({ id: notificationId });
  return request(`/notifications?${params.toString()}`, {
    method: "DELETE"
  });
}

function getSession() {
  return request("/auth/me");
}

function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function signup(payload) {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function logout() {
  return request("/auth/logout", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export {
  createFlower,
  deleteFlower,
  createOrder,
  createNotification,
  getFlowers,
  getNotifications,
  getOrders,
  getSession,
  login,
  signup,
  logout,
  deleteNotification
};
