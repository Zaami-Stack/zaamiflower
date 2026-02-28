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
    const error = new Error(errorPayload.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function requestWithFallback(paths, options = {}) {
  let lastError = null;
  for (const path of paths) {
    try {
      return await request(path, options);
    } catch (error) {
      lastError = error;
      if (error?.status !== 404) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Request failed");
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
  const query = `?${params.toString()}`;
  return requestWithFallback([`/notifications${query}`, `/announcements${query}`]);
}

function createNotification(payload) {
  return requestWithFallback(["/notifications", "/announcements"], {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function deleteNotification(notificationId) {
  const params = new URLSearchParams({ id: notificationId });
  const query = `?${params.toString()}`;
  return requestWithFallback([`/notifications${query}`, `/announcements${query}`], {
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
