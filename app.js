// AetherGrocery Core Frontend Controller

// -------------------------------------------------------------
// Global Application State
// -------------------------------------------------------------
let state = {
  currentUser: JSON.parse(localStorage.getItem('groceryUser')) || null,
  products: [],
  offers: [],
  cart: JSON.parse(localStorage.getItem('groceryCart')) || [],
  compareList: [],
  orders: [],
  notifications: [],
  activeView: 'products-view',
  selectedTrackOrderId: null,
  adminAuthenticated: false,
  trackingInterval: null,
  notifInterval: null,
  appliedCoupon: null
};

// SVG icons or unicode mappings for categories
const categoryEmojis = {
  Fruits: '🍎',
  Vegetables: '🥬',
  Dairy: '🥛',
  Bakery: '🍞',
  Pantry: '🧴'
};

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAuth();
  setupCatalogControls();
  setupCartControls();
  setupCompareDrawer();
  setupPaymentForm();
  setupAdminPortal();
  setupNotificationCenter();
  
  // Initial loads
  fetchProducts();
  fetchOffers();
  updateHeaderUserUI();
  updateCartBadge();
  
  // Start background notification check
  startNotificationPolling();
});

// -------------------------------------------------------------
// SPA Navigation & Routing
// -------------------------------------------------------------
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const viewPanels = document.querySelectorAll('.view-panel');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      switchView(target);
    });
  });

  // Logo returns to home
  document.getElementById('nav-logo').addEventListener('click', () => {
    switchView('products-view');
  });
}

function switchView(viewId) {
  // Clear previous intervals if leaving tracking
  if (viewId !== 'tracking-view' && state.trackingInterval) {
    clearInterval(state.trackingInterval);
    state.trackingInterval = null;
  }

  // Handle views activation
  const viewPanels = document.querySelectorAll('.view-panel');
  viewPanels.forEach(panel => {
    if (panel.id === viewId) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Update Nav links selection
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    if (btn.getAttribute('data-target') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  state.activeView = viewId;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger special loads based on view
  if (viewId === 'cart-view') {
    renderCart();
  } else if (viewId === 'tracking-view') {
    fetchUserOrders();
  } else if (viewId === 'admin-view') {
    if (state.adminAuthenticated) {
      loadAdminDashboard();
    }
  } else if (viewId === 'offers-view') {
    renderOffersPage();
  }
}

// -------------------------------------------------------------
// Authentication Logic
// -------------------------------------------------------------
function setupAuth() {
  const authModal = document.getElementById('auth-modal');
  const authTrigger = document.getElementById('auth-trigger-btn');
  const closeAuth = document.getElementById('close-auth-modal');
  const tabLogin = document.getElementById('tab-login-btn');
  const tabRegister = document.getElementById('tab-register-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authError = document.getElementById('auth-error-msg');
  const logoutBtn = document.getElementById('logout-btn');

  authTrigger.addEventListener('click', () => {
    authError.textContent = '';
    authModal.classList.add('show');
  });

  closeAuth.addEventListener('click', () => {
    authModal.classList.remove('show');
  });

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  // Sign In submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        state.currentUser = data;
        localStorage.setItem('groceryUser', JSON.stringify(data));
        updateHeaderUserUI();
        authModal.classList.remove('show');
        loginForm.reset();
        
        // Push login alert
        showNotificationToast("Successfully signed in!");
        
        // If checking out and logged in, refresh cart or return
        if (state.activeView === 'cart-view') {
          renderCart();
        }
      } else {
        authError.textContent = data.error || "Login failed";
      }
    } catch (err) {
      authError.textContent = "Error connecting to server";
    }
  });

  // Register submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    if (password.length < 6) {
      authError.textContent = "Password must be at least 6 characters long";
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        state.currentUser = data;
        localStorage.setItem('groceryUser', JSON.stringify(data));
        updateHeaderUserUI();
        authModal.classList.remove('show');
        registerForm.reset();
        showNotificationToast(`Welcome to AetherGrocery, ${data.name}!`);
      } else {
        authError.textContent = data.error || "Registration failed";
      }
    } catch (err) {
      authError.textContent = "Error connecting to server";
    }
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    state.currentUser = null;
    localStorage.removeItem('groceryUser');
    state.adminAuthenticated = false;
    document.getElementById('admin-portal').classList.add('hidden');
    document.getElementById('admin-auth-panel').classList.remove('hidden');
    updateHeaderUserUI();
    showNotificationToast("Signed out successfully.");
    switchView('products-view');
  });
}

function updateHeaderUserUI() {
  const authTrigger = document.getElementById('auth-trigger-btn');
  const loggedInfo = document.getElementById('user-logged-info');
  const usernameDisp = document.getElementById('username-display');
  const cashbackDisp = document.getElementById('cashback-display');

  if (state.currentUser) {
    authTrigger.classList.add('hidden');
    loggedInfo.classList.remove('hidden');
    usernameDisp.textContent = state.currentUser.name;
    cashbackDisp.textContent = parseFloat(state.currentUser.cashbackBalance).toFixed(2);
    
    // Show admin tab button if role is admin
    if (state.currentUser.role === 'admin') {
      document.getElementById('nav-admin-btn').classList.remove('hidden');
    } else {
      document.getElementById('nav-admin-btn').classList.add('hidden');
    }
  } else {
    authTrigger.classList.remove('hidden');
    loggedInfo.classList.add('hidden');
    document.getElementById('nav-admin-btn').classList.add('hidden');
  }
}

// -------------------------------------------------------------
// Catalog & Product Functions
// -------------------------------------------------------------
async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    state.products = data;
    renderProducts();
  } catch (err) {
    console.error("Failed to load products", err);
  }
}

function setupCatalogControls() {
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const sortSelect = document.getElementById('sort-select');

  searchInput.addEventListener('input', renderProducts);
  
  categoryFilter.addEventListener('click', (e) => {
    if (e.target.classList.contains('cat-btn')) {
      document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      renderProducts();
    }
  });

  sortSelect.addEventListener('change', renderProducts);
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';

  const query = document.getElementById('search-input').value.toLowerCase();
  const category = document.querySelector('.cat-btn.active').getAttribute('data-category');
  const sortOption = document.getElementById('sort-select').value;

  // Filter products
  let filtered = state.products.filter(prod => {
    const matchesSearch = prod.name.toLowerCase().includes(query) || prod.description.toLowerCase().includes(query);
    const matchesCategory = category === 'all' || prod.category === category;
    return matchesSearch && matchesCategory;
  });

  // Sort products
  if (sortOption === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortOption === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sortOption === 'name-asc') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-message" style="grid-column: 1/-1;">No products match your filters. Try a different search!</div>`;
    return;
  }

  filtered.forEach(prod => {
    const isLowStock = prod.stock <= 10;
    const isOutOfStock = prod.stock === 0;
    const emoji = categoryEmojis[prod.category] || '📦';
    
    // Check if product qualifies for BOGO or FRESH20 to show promotional badges
    let promoBadge = '';
    if (prod.offers && prod.offers.includes('FRESH20')) {
      promoBadge = `<span class="prod-offer-badge">20% PRODUCE</span>`;
    } else if (prod.offers && prod.offers.includes('BOGO')) {
      promoBadge = `<span class="prod-offer-badge">BOGO FREE</span>`;
    }

    const card = document.createElement('div');
    card.className = `product-card ${isOutOfStock ? 'out-of-stock' : ''}`;
    card.innerHTML = `
      <div class="prod-visual">
        ${emoji}
        <span class="prod-category-badge">${prod.category}</span>
        ${promoBadge}
      </div>
      <div class="prod-content">
        <h3 class="prod-name">${prod.name}</h3>
        <p class="prod-desc">${prod.description}</p>
        <div class="prod-nutri">${prod.nutrition}</div>
        <div class="prod-bottom">
          <div>
            <div class="prod-price">$${prod.price.toFixed(2)}</div>
            <div class="prod-stock-label ${isLowStock ? 'low-stock' : ''}">
              ${isOutOfStock ? 'OUT OF STOCK' : (isLowStock ? `Low Stock: Only ${prod.stock} left` : `In Stock: ${prod.stock}`)}
            </div>
          </div>
        </div>
        <div class="prod-actions">
          <button class="btn btn-primary btn-sm flex-grow btn-add-cart" data-id="${prod.id}" ${isOutOfStock ? 'disabled' : ''}>
            ${isOutOfStock ? 'Sold Out' : '🛒 Add to Cart'}
          </button>
          <button class="btn-compare-add ${state.compareList.some(item => item.id === prod.id) ? 'added' : ''}" data-id="${prod.id}">
            ⚖️
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Bind Add to Cart listeners
  grid.querySelectorAll('.btn-add-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      addToCart(id);
    });
  });

  // Bind Compare listeners
  grid.querySelectorAll('.btn-compare-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      toggleCompare(id);
    });
  });
}

// -------------------------------------------------------------
// Cart state management & Smart Offer Calculations
// -------------------------------------------------------------
function addToCart(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const existing = state.cart.find(item => item.productId === productId);
  if (existing) {
    if (existing.quantity >= prod.stock) {
      showNotificationToast(`Stock limit reached for ${prod.name}! Available: ${prod.stock}`);
      return;
    }
    existing.quantity++;
  } else {
    state.cart.push({
      productId: prod.id,
      name: prod.name,
      price: prod.price,
      quantity: 1,
      category: prod.category
    });
  }

  saveCart();
  updateCartBadge();
  showNotificationToast(`Added ${prod.name} to Cart`);
  renderProducts(); // Update inline stock counts
}

function saveCart() {
  localStorage.setItem('groceryCart', JSON.stringify(state.cart));
}

function updateCartBadge() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cart-count').textContent = count;
}

function setupCartControls() {
  const couponInput = document.getElementById('cart-coupon-input');
  const applyCouponBtn = document.getElementById('apply-coupon-btn');
  const useCashbackCheck = document.getElementById('use-cashback-check');
  const checkoutBtn = document.getElementById('checkout-trigger-btn');

  applyCouponBtn.addEventListener('click', () => {
    const code = couponInput.value.trim().toUpperCase();
    if (!code) {
      state.appliedCoupon = null;
      renderCart();
      return;
    }
    // Perform simulated check against offers
    const offer = state.offers.find(o => o.code === code);
    const statusMsg = document.getElementById('coupon-status-msg');

    if (offer) {
      // Basic checkout checks
      const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      if (subtotal < offer.minPurchase) {
        statusMsg.className = 'coupon-status error';
        statusMsg.textContent = `Coupon ${code} requires min purchase of $${offer.minPurchase.toFixed(2)}`;
        state.appliedCoupon = null;
      } else {
        statusMsg.className = 'coupon-status success';
        statusMsg.textContent = `Coupon ${code} applied: ${offer.description}`;
        state.appliedCoupon = offer;
      }
    } else {
      statusMsg.className = 'coupon-status error';
      statusMsg.textContent = `Invalid coupon code: "${code}"`;
      state.appliedCoupon = null;
    }
    renderCart();
  });

  useCashbackCheck.addEventListener('change', () => {
    renderCart();
  });

  checkoutBtn.addEventListener('click', () => {
    // 1. Verify User logged in
    if (!state.currentUser) {
      showNotificationToast("Please log in to proceed to checkout.");
      document.getElementById('auth-modal').classList.add('show');
      return;
    }

    // 2. Verify Cart not empty
    if (state.cart.length === 0) {
      showNotificationToast("Your cart is empty.");
      return;
    }

    // 3. Verify address entered
    const address = document.getElementById('shipping-address').value.trim();
    if (!address) {
      showNotificationToast("Please enter a valid shipping address.");
      document.getElementById('shipping-address').focus();
      return;
    }

    // Open Secure checkout
    openCheckoutPayment();
  });
}

function renderCart() {
  const tbody = document.getElementById('cart-table-body');
  tbody.innerHTML = '';

  const cashbackBalance = state.currentUser ? parseFloat(state.currentUser.cashbackBalance) : 0.0;
  document.getElementById('cart-available-cashback').textContent = cashbackBalance.toFixed(2);

  if (state.cart.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-message">Your cart is empty. Browse the catalog to add items!</td>
      </tr>
    `;
    // Reset summaries
    document.getElementById('summary-subtotal').textContent = '0.00';
    document.getElementById('summary-discount').textContent = '0.00';
    document.getElementById('summary-cashback-used').textContent = '0.00';
    document.getElementById('summary-delivery').textContent = '0.00';
    document.getElementById('summary-total').textContent = '0.00';
    document.getElementById('summary-cashback-earned-banner').classList.add('hidden');
    return;
  }

  // Render items
  state.cart.forEach(item => {
    const prod = state.products.find(p => p.id === item.productId);
    const maxQty = prod ? prod.stock : 100;
    const emoji = categoryEmojis[item.category] || '📦';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="cart-item-title">
          <span class="cart-item-icon">${emoji}</span>
          <div>
            <span class="cart-item-name">${item.name}</span>
            <span class="cart-item-category">${item.category}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="cart-item-price">$${item.price.toFixed(2)}</span>
      </td>
      <td>
        <div class="qty-controls">
          <button class="qty-btn dec-qty" data-id="${item.productId}">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn inc-qty" data-id="${item.productId}" ${item.quantity >= maxQty ? 'disabled' : ''}>+</button>
        </div>
      </td>
      <td>
        <span class="cart-item-total">$${(item.price * item.quantity).toFixed(2)}</span>
      </td>
      <td>
        <button class="btn-delete-item delete-cart-item" data-id="${item.productId}">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Calculate Math
  let subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discount = 0;
  let cashbackEarned = 0;

  // Apply localized offers engine preview math
  if (state.appliedCoupon) {
    const offer = state.appliedCoupon;
    if (subtotal >= offer.minPurchase) {
      if (offer.type === 'percentage') {
        if (offer.applicableCategories.length > 0) {
          let discountable = 0;
          state.cart.forEach(item => {
            if (offer.applicableCategories.includes(item.category)) {
              discountable += item.price * item.quantity;
            }
          });
          discount = discountable * (offer.value / 100);
        } else {
          discount = subtotal * (offer.value / 100);
        }
      } else if (offer.type === 'flat') {
        discount = Math.min(offer.value, subtotal);
      } else if (offer.type === 'bogo') {
        // Dairy BOGO: every second item is free
        let dairyDiscount = 0;
        const dairy = state.cart.filter(item => offer.applicableCategories.includes(item.category));
        dairy.forEach(item => {
          const free = Math.floor(item.quantity / 2);
          dairyDiscount += free * item.price;
        });
        discount = dairyDiscount;
      } else if (offer.type === 'cashback') {
        cashbackEarned = subtotal * (offer.value / 100);
      }
    }
  }

  const deliveryFee = (subtotal - discount) >= 40 ? 0.00 : 3.99;
  let totalPayable = subtotal - discount + deliveryFee;

  let cashbackUsed = 0;
  if (document.getElementById('use-cashback-check').checked && state.currentUser) {
    cashbackUsed = Math.min(cashbackBalance, totalPayable);
    totalPayable -= cashbackUsed;
  }

  // Update DOM summaries
  document.getElementById('summary-subtotal').textContent = subtotal.toFixed(2);
  document.getElementById('summary-discount').textContent = discount.toFixed(2);
  document.getElementById('summary-cashback-used').textContent = cashbackUsed.toFixed(2);
  document.getElementById('summary-delivery').textContent = deliveryFee.toFixed(2);
  document.getElementById('summary-total').textContent = totalPayable.toFixed(2);

  if (cashbackEarned > 0) {
    document.getElementById('summary-cashback-earned-banner').classList.remove('hidden');
    document.getElementById('summary-cashback-earned').textContent = cashbackEarned.toFixed(2);
  } else {
    document.getElementById('summary-cashback-earned-banner').classList.add('hidden');
  }

  // Bind cart action listeners
  tbody.querySelectorAll('.dec-qty').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const item = state.cart.find(c => c.productId === id);
      if (item.quantity > 1) {
        item.quantity--;
      } else {
        state.cart = state.cart.filter(c => c.productId !== id);
      }
      saveCart();
      updateCartBadge();
      renderCart();
      renderProducts();
    });
  });

  tbody.querySelectorAll('.inc-qty').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const item = state.cart.find(c => c.productId === id);
      const prod = state.products.find(p => p.id === id);
      if (item && prod && item.quantity < prod.stock) {
        item.quantity++;
        saveCart();
        updateCartBadge();
        renderCart();
        renderProducts();
      }
    });
  });

  tbody.querySelectorAll('.delete-cart-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      state.cart = state.cart.filter(c => c.productId !== id);
      saveCart();
      updateCartBadge();
      renderCart();
      renderProducts();
    });
  });
}

// -------------------------------------------------------------
// Interactive Compare Drawer
// -------------------------------------------------------------
function setupCompareDrawer() {
  const drawer = document.getElementById('compare-drawer');
  const toggleBtn = document.getElementById('compare-toggle-btn');
  const clearBtn = document.getElementById('clear-compare-btn');
  const header = document.querySelector('.compare-drawer-header');

  header.addEventListener('click', (e) => {
    if (e.target.id === 'clear-compare-btn') return;
    drawer.classList.toggle('expanded');
    toggleBtn.textContent = drawer.classList.contains('expanded') ? '▼ Collapse' : '▲ Expand';
  });

  clearBtn.addEventListener('click', () => {
    state.compareList = [];
    document.querySelectorAll('.btn-compare-add').forEach(btn => btn.classList.remove('added'));
    document.getElementById('compare-banner').classList.add('hidden');
    drawer.classList.remove('expanded');
    toggleBtn.textContent = '▲ Expand';
    renderCompareTable();
  });
}

function toggleCompare(productId) {
  const idx = state.compareList.findIndex(item => item.id === productId);
  const btn = document.querySelector(`.btn-compare-add[data-id="${productId}"]`);

  if (idx !== -1) {
    state.compareList.splice(idx, 1);
    if (btn) btn.classList.remove('added');
  } else {
    if (state.compareList.length >= 3) {
      showNotificationToast("You can compare up to 3 products at a time.");
      return;
    }
    const prod = state.products.find(p => p.id === productId);
    if (prod) {
      state.compareList.push(prod);
      if (btn) btn.classList.add('added');
    }
  }

  // Show/Hide comparison drawer based on selection count
  const banner = document.getElementById('compare-banner');
  const label = document.getElementById('compare-count-label');
  label.textContent = `(${state.compareList.length}/3 items selected)`;

  if (state.compareList.length > 0) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
    document.getElementById('compare-drawer').classList.remove('expanded');
  }

  renderCompareTable();
}

function renderCompareTable() {
  const tbody = document.getElementById('compare-tbody');
  tbody.innerHTML = '';

  if (state.compareList.length === 0) {
    tbody.innerHTML = `<tr><td style="text-align:center; padding: 40px;" colspan="4">No items added to compare yet.</td></tr>`;
    return;
  }

  const attributes = [
    { label: 'Product Name', key: 'name' },
    { label: 'Category', key: 'category' },
    { label: 'Price', key: 'price', format: (val) => `$${val.toFixed(2)}` },
    { label: 'Description', key: 'description' },
    { label: 'Nutrition', key: 'nutrition' },
    { label: 'Stock Qty', key: 'stock' }
  ];

  // Draw rows for each attribute
  attributes.forEach(attr => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${attr.label}</td>`;
    
    state.compareList.forEach(prod => {
      let val = prod[attr.key];
      if (attr.format) val = attr.format(val);
      tr.innerHTML += `<td><strong>${val || 'N/A'}</strong></td>`;
    });

    // Fill missing column cells if less than 3 products compared
    for (let i = state.compareList.length; i < 3; i++) {
      tr.innerHTML += `<td>-</td>`;
    }
    tbody.appendChild(tr);
  });

  // Draw an actions row (Add to cart buttons)
  const actionTr = document.createElement('tr');
  actionTr.innerHTML = `<td>Action</td>`;
  state.compareList.forEach(prod => {
    const isOutOfStock = prod.stock === 0;
    actionTr.innerHTML += `
      <td>
        <button class="btn btn-primary btn-sm compare-tbl-add" data-id="${prod.id}" ${isOutOfStock ? 'disabled' : ''}>
          ${isOutOfStock ? 'Sold Out' : '🛒 Add'}
        </button>
      </td>
    `;
  });
  for (let i = state.compareList.length; i < 3; i++) {
    actionTr.innerHTML += `<td>-</td>`;
  }
  tbody.appendChild(actionTr);

  // Bind compare add listeners
  tbody.querySelectorAll('.compare-tbl-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      addToCart(id);
    });
  });
}

// -------------------------------------------------------------
// Interactive Secure Checkout & Credit Card Logic
// -------------------------------------------------------------
function openCheckoutPayment() {
  const payModal = document.getElementById('payment-modal');
  const amountDisp = document.getElementById('payment-modal-total');
  const cartTotalText = document.getElementById('summary-total').textContent;

  amountDisp.textContent = cartTotalText;
  document.getElementById('payment-error-msg').textContent = '';
  payModal.classList.add('show');
}

function setupPaymentForm() {
  const payModal = document.getElementById('payment-modal');
  const closeBtn = document.getElementById('close-payment-modal');
  const form = document.getElementById('payment-form');

  // Input elements
  const inputCardholder = document.getElementById('pay-cardholder');
  const inputCardnumber = document.getElementById('pay-cardnumber');
  const inputExpiry = document.getElementById('pay-expiry');
  const inputCVV = document.getElementById('pay-cvv');

  // Display fields on physical card mockup
  const displayHolder = document.getElementById('card-name-display');
  const displayNumber = document.getElementById('card-num-display');
  const displayExpiry = document.getElementById('card-expiry-display');

  closeBtn.addEventListener('click', () => {
    payModal.classList.remove('show');
  });

  // Sync inputs with physical card rendering
  inputCardholder.addEventListener('input', (e) => {
    displayHolder.textContent = e.target.value.toUpperCase() || 'YOUR NAME';
  });

  inputCardnumber.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, ''); // numbers only
    if (val.length > 0) {
      val = val.match(new RegExp('.{1,4}', 'g')).join(' '); // spacing format
    }
    e.target.value = val;
    displayNumber.textContent = val || '•••• •••• •••• ••••';
  });

  inputExpiry.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 2) {
      val = val.slice(0,2) + '/' + val.slice(2,4);
    }
    e.target.value = val;
    displayExpiry.textContent = val || 'MM/YY';
  });

  inputCVV.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  // Submit payment checkout
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('payment-error-msg').textContent = '';

    const couponCode = state.appliedCoupon ? state.appliedCoupon.code : '';
    const address = document.getElementById('shipping-address').value.trim();
    const useCashback = document.getElementById('use-cashback-check').checked;

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: state.currentUser.id,
          items: state.cart,
          couponCode,
          address,
          useCashback
        })
      });
      const data = await res.json();
      if (res.ok) {
        // Success
        state.cart = [];
        saveCart();
        updateCartBadge();
        state.appliedCoupon = null;
        document.getElementById('cart-coupon-input').value = '';
        document.getElementById('coupon-status-msg').textContent = '';
        document.getElementById('shipping-address').value = '';

        // Update user state cashback
        state.currentUser.cashbackBalance = data.userCashback;
        localStorage.setItem('groceryUser', JSON.stringify(state.currentUser));
        updateHeaderUserUI();

        payModal.classList.remove('show');
        form.reset();

        // Sync inputs back to card defaults
        displayHolder.textContent = 'YOUR NAME';
        displayNumber.textContent = '•••• •••• •••• ••••';
        displayExpiry.textContent = 'MM/YY';

        showNotificationToast(`Order Placed! Check delivery steps.`);
        
        // Go to live track, auto-select the placed order
        state.selectedTrackOrderId = data.order.id;
        switchView('tracking-view');
        fetchUserOrders(); // Reload orders grid
        renderTrackDetails(data.order);
      } else {
        document.getElementById('payment-error-msg').textContent = data.error || "Order placement failed";
      }
    } catch (err) {
      document.getElementById('payment-error-msg').textContent = "Connection issue";
    }
  });
}

// -------------------------------------------------------------
// Live Tracker Maps & Stepper Animate (Canvas)
// -------------------------------------------------------------
async function fetchUserOrders() {
  if (!state.currentUser) return;
  
  try {
    const res = await fetch(`/api/orders?userId=${state.currentUser.id}`);
    const data = await res.json();
    state.orders = data.reverse(); // Newest first
    renderOrdersList();

    // Setup active tracking coordinate fetch loop if tracking-view active and order selected
    if (state.selectedTrackOrderId) {
      const activeOrder = state.orders.find(o => o.id === state.selectedTrackOrderId);
      if (activeOrder) {
        renderTrackDetails(activeOrder);
      }
    }
  } catch (err) {
    console.error("Error loading order list", err);
  }
}

function renderOrdersList() {
  const container = document.getElementById('user-orders-list');
  container.innerHTML = '';

  if (state.orders.length === 0) {
    container.innerHTML = `<div class="empty-message">No orders placed yet. Check out to track shipments.</div>`;
    return;
  }

  state.orders.forEach(order => {
    const card = document.createElement('div');
    card.className = `order-item-card ${state.selectedTrackOrderId === order.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="order-card-hdr">
        <h4>Order #${order.id}</h4>
        <span class="order-card-status status-${order.status.toLowerCase().replace(/\s+/g, '')}">${order.status}</span>
      </div>
      <div class="order-card-dtl">
        <span>${order.timestamp}</span>
        <strong>$${order.total.toFixed(2)}</strong>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.order-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.selectedTrackOrderId = order.id;
      
      // Stop previous interval
      if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
      }

      renderTrackDetails(order);
      
      // Periodically poll active details
      state.trackingInterval = setInterval(() => {
        pollOrderUpdates(order.id);
      }, 5000);
    });
    container.appendChild(card);
  });
}

async function pollOrderUpdates(orderId) {
  try {
    const res = await fetch(`/api/orders?userId=${state.currentUser.id}`);
    const orders = await res.json();
    const match = orders.find(o => o.id === orderId);
    if (match) {
      renderTrackDetails(match);
      // Update local state copy
      const idx = state.orders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        state.orders[idx] = match;
        // Refresh statuses in listing list UI
        const listing = document.getElementById('user-orders-list').children[idx];
        if (listing) {
          const statusBadge = listing.querySelector('.order-card-status');
          statusBadge.textContent = match.status;
          statusBadge.className = `order-card-status status-${match.status.toLowerCase().replace(/\s+/g, '')}`;
        }
      }
    }
  } catch (e) {
    console.error("Failed coordinate poll", e);
  }
}

function renderTrackDetails(order) {
  document.getElementById('tracking-placeholder').classList.add('hidden');
  const details = document.getElementById('tracking-visualizer');
  details.classList.remove('hidden');

  // Headers
  document.getElementById('track-order-id').textContent = `#${order.id}`;
  document.getElementById('track-order-date').textContent = order.timestamp;
  
  const badge = document.getElementById('track-order-badge');
  badge.textContent = order.status;
  badge.className = `status-badge status-${order.status.toLowerCase().replace(/\s+/g, '')}`;

  // Stepper highlights
  updateStepperProgress(order.status);

  // Canvas map draw
  drawMapCoordinates(order.vehicleCoords, order.status);

  // Financial summary
  const itemsList = document.getElementById('track-items-summary');
  itemsList.innerHTML = '';
  order.items.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `• ${item.name} (x${item.quantity}) - $${(item.price * item.quantity).toFixed(2)}`;
    itemsList.appendChild(li);
  });

  document.getElementById('track-subtotal').textContent = order.subtotal.toFixed(2);
  document.getElementById('track-discount').textContent = order.discount.toFixed(2);
  document.getElementById('track-cashback-used').textContent = order.cashbackUsed ? order.cashbackUsed.toFixed(2) : '0.00';
  document.getElementById('track-delivery').textContent = order.deliveryFee.toFixed(2);
  document.getElementById('track-total').textContent = order.total.toFixed(2);
}

function updateStepperProgress(status) {
  const steps = ['Pending', 'Dispatched', 'Out for Delivery', 'Delivered'];
  const currentIdx = steps.indexOf(status);

  // Reset lines & step circles
  document.getElementById('step-pending').className = 'step';
  document.getElementById('step-dispatched').className = 'step';
  document.getElementById('step-outfordelivery').className = 'step';
  document.getElementById('step-delivered').className = 'step';

  document.getElementById('line-pending').className = 'step-line';
  document.getElementById('line-dispatched').className = 'step-line';
  document.getElementById('line-outfordelivery').className = 'step-line';

  if (currentIdx >= 0) {
    document.getElementById('step-pending').classList.add('active');
  }
  if (currentIdx >= 1) {
    document.getElementById('step-pending').className = 'step completed';
    document.getElementById('line-pending').classList.add('completed');
    document.getElementById('step-dispatched').classList.add('active');
  }
  if (currentIdx >= 2) {
    document.getElementById('step-dispatched').className = 'step completed';
    document.getElementById('line-dispatched').classList.add('completed');
    document.getElementById('step-outfordelivery').classList.add('active');
  }
  if (currentIdx >= 3) {
    document.getElementById('step-outfordelivery').className = 'step completed';
    document.getElementById('line-outfordelivery').classList.add('completed');
    document.getElementById('step-delivered').className = 'step completed';
  }
}

function drawMapCoordinates(coords, status) {
  const canvas = document.getElementById('delivery-map');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Clear canvas
  ctx.fillStyle = '#0f101b';
  ctx.fillRect(0, 0, w, h);

  // Draw grid roads background
  ctx.strokeStyle = '#1e2030';
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  for (let j = 0; j < h; j += 40) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(w, j);
    ctx.stroke();
  }

  // Draw route connecting Store and House
  // Store node: x% of width, y% of height
  const storeX = Math.round(w * 0.15);
  const storeY = Math.round(h * 0.8);
  const houseX = Math.round(w * 0.85);
  const houseY = Math.round(h * 0.25);

  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(storeX, storeY);
  ctx.lineTo(houseX, houseY);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash

  // Draw Store node
  ctx.fillStyle = '#6366f1';
  ctx.beginPath();
  ctx.arc(storeX, storeY, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Outfit';
  ctx.textAlign = 'center';
  ctx.fillText('🏢 STORE', storeX, storeY + 30);

  // Draw House node
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(houseX, houseY, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('🏠 HOME', houseX, houseY - 24);

  // Render Delivery vehicle icon matching active updates
  // Convert server coordinates percentage grid (10 to 90) to local width/height
  const vehiclePctX = coords.x;
  const vehiclePctY = coords.y;

  // Linear map percent to pixel widths
  // coordinates in server represent percent from 10 to 90
  const mappedX = Math.round(w * (vehiclePctX / 100));
  const mappedY = Math.round(h * (vehiclePctY / 100));

  // Rider label
  if (status !== 'Pending') {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(mappedX, mappedY, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px serif';
    ctx.fillText('🛵', mappedX, mappedY + 5);

    ctx.font = '10px Outfit';
    ctx.fillText('Rider', mappedX, mappedY - 16);
  }
}

// -------------------------------------------------------------
// Live Offers rendering page
// -------------------------------------------------------------
async function fetchOffers() {
  try {
    const res = await fetch('/api/offers');
    const data = await res.json();
    state.offers = data;
  } catch (err) {
    console.error("Failed loading active offers", err);
  }
}

function renderOffersPage() {
  const container = document.getElementById('offers-grid');
  container.innerHTML = '';

  state.offers.forEach(off => {
    const card = document.createElement('div');
    card.className = 'offer-promo-card';
    card.innerHTML = `
      <div class="promo-coupon-header">
        <span class="coupon-type-badge">${off.type.toUpperCase()}</span>
        <span class="promo-code">${off.code}</span>
      </div>
      <p class="promo-desc">${off.description}</p>
      <p class="promo-rule">Min. purchase required: $${off.minPurchase.toFixed(2)} ${off.applicableCategories.length > 0 ? `(on Category: ${off.applicableCategories.join(', ')})` : ''}</p>
      <div class="promo-action">
        <button class="btn btn-secondary btn-sm btn-block copy-promo-btn" data-code="${off.code}">Apply Offer Code</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Bind copy listeners
  container.querySelectorAll('.copy-promo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      // Fill the coupon field in cart and swap
      document.getElementById('cart-coupon-input').value = code;
      showNotificationToast(`Promo code "${code}" added to check! Open cart to apply.`);
      switchView('cart-view');
      // Trigger click check
      document.getElementById('apply-coupon-btn').click();
    });
  });

  // Load recommendations
  renderRecommendations();
}

function renderRecommendations() {
  const grid = document.getElementById('recommendations-grid');
  grid.innerHTML = '';

  // Seed 4 items as recommendations
  const items = state.products.slice(0, 4);
  items.forEach(prod => {
    const emoji = categoryEmojis[prod.category] || '🥬';
    const card = document.createElement('div');
    card.className = 'rec-card';
    card.innerHTML = `
      <div class="rec-icon">${emoji}</div>
      <div class="rec-info">
        <h4>${prod.name}</h4>
        <span>$${prod.price.toFixed(2)}</span>
        <button class="rec-add-btn" data-id="${prod.id}">+ Add to Cart</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('.rec-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      addToCart(id);
    });
  });
}

// -------------------------------------------------------------
// Real-Time Notification Feeds
// -------------------------------------------------------------
function setupNotificationCenter() {
  const bell = document.getElementById('notif-bell');
  const dropdown = document.getElementById('notif-dropdown');
  const clearBtn = document.getElementById('clear-notif-btn');

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('show');
  });

  clearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    // For simplicity, local clear
    document.getElementById('notif-list').innerHTML = `<div class="no-notif">No new notifications</div>`;
    document.getElementById('notif-count').textContent = '0';
  });
}

function startNotificationPolling() {
  fetchNotifications();
  state.notifInterval = setInterval(() => {
    fetchNotifications();
  }, 4000);
}

async function fetchNotifications() {
  const userId = state.currentUser ? state.currentUser.id : null;
  const url = userId ? `/api/notifications?userId=${userId}` : '/api/notifications';

  try {
    const res = await fetch(url);
    const notifications = await res.json();
    
    // Check if new status notifications arrived compared to cache length
    if (state.notifications.length > 0 && notifications.length > state.notifications.length) {
      // Trigger overlay toast for the newest alert
      const newest = notifications[0];
      showNotificationToast(`🔔 Update: ${newest.message}`);
      
      // If tracking-view is open, reload user orders status coordinates
      if (state.activeView === 'tracking-view') {
        fetchUserOrders();
      }
    }
    
    state.notifications = notifications;
    renderNotificationsMenu();
  } catch (err) {
    console.error("Error loading notification feeds", err);
  }
}

function renderNotificationsMenu() {
  const list = document.getElementById('notif-list');
  const countBadge = document.getElementById('notif-count');
  list.innerHTML = '';

  const activeCount = state.notifications.length;
  countBadge.textContent = activeCount;

  if (activeCount === 0) {
    list.innerHTML = `<div class="no-notif">No new notifications</div>`;
    return;
  }

  state.notifications.forEach(notif => {
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = `
      <p>${notif.message}</p>
      <span class="notif-time">${notif.timestamp}</span>
    `;
    list.appendChild(item);
  });
}

// Global visual toaster
function showNotificationToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'panel-card';
  toast.style.position = 'fixed';
  toast.style.bottom = '80px';
  toast.style.right = '30px';
  toast.style.zIndex = '9999';
  toast.style.background = 'rgba(23, 23, 38, 0.95)';
  toast.style.borderColor = 'var(--primary-color)';
  toast.style.color = '#fff';
  toast.style.fontSize = '0.85rem';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)';
  toast.style.animation = 'fadeIn 0.3s ease';
  toast.textContent = msg;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s ease';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// -------------------------------------------------------------
// Centralized Admin Dashboard Logic
// -------------------------------------------------------------
function setupAdminPortal() {
  const loginCard = document.getElementById('admin-auth-panel');
  const portal = document.getElementById('admin-portal');
  const loginBtn = document.getElementById('admin-login-btn');
  const passInput = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('admin-auth-error');
  const logoutBtn = document.getElementById('admin-logout-btn');

  loginBtn.addEventListener('click', () => {
    const password = passInput.value;
    if (password === 'admin123') {
      state.adminAuthenticated = true;
      loginCard.classList.add('hidden');
      portal.classList.remove('hidden');
      errorMsg.textContent = '';
      passInput.value = '';
      loadAdminDashboard();
    } else {
      errorMsg.textContent = "Incorrect admin password. Try again.";
    }
  });

  logoutBtn.addEventListener('click', () => {
    state.adminAuthenticated = false;
    portal.classList.add('hidden');
    loginCard.classList.remove('hidden');
  });

  // Admin section tabs routing
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const target = tab.getAttribute('data-admin-target');
      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(target).classList.add('active');
    });
  });

  // Admin Add Product Form submit
  document.getElementById('admin-product-form').addEventListener('submit', handleProductFormSubmit);
  document.getElementById('cancel-edit-prod-btn').addEventListener('click', resetProductForm);

  // Admin Add Offer Form submit
  document.getElementById('admin-offer-form').addEventListener('submit', handleOfferFormSubmit);
}

async function loadAdminDashboard() {
  try {
    // Reload items to admin views
    const productsRes = await fetch('/api/products');
    state.products = await productsRes.json();

    const offersRes = await fetch('/api/offers');
    state.offers = await offersRes.json();

    const ordersRes = await fetch('/api/orders');
    const orders = await ordersRes.json();

    // Render Metrics
    const revenue = orders.reduce((sum, o) => sum + o.total, 0);
    const lowStock = state.products.filter(p => p.stock < 15).length;

    document.getElementById('metric-revenue').textContent = revenue.toFixed(2);
    document.getElementById('metric-orders').textContent = orders.length;
    document.getElementById('metric-offers').textContent = state.offers.length;
    document.getElementById('metric-low-stock').textContent = lowStock;

    // Render Tabs list
    renderAdminOrdersTable(orders);
    renderAdminProductsTable();
    renderAdminOffersTable();
    renderProductFormCoupons();

  } catch (err) {
    console.error("Admin dashboard load failed", err);
  }
}

// Render Orders Tab
function renderAdminOrdersTable(orders) {
  const tbody = document.getElementById('admin-orders-table-body');
  tbody.innerHTML = '';

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-message">No orders placed by customers yet.</td></tr>`;
    return;
  }

  orders.reverse().forEach(ord => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${ord.id}</strong><br><span style="font-size:0.7rem; color:var(--text-secondary);">${ord.timestamp}</span></td>
      <td>${ord.deliveryAddress}</td>
      <td>${ord.items.length} items</td>
      <td><strong>$${ord.total.toFixed(2)}</strong></td>
      <td>${ord.appliedOffer || 'None'}</td>
      <td><span class="order-card-status status-${ord.status.toLowerCase().replace(/\s+/g, '')}">${ord.status}</span></td>
      <td>
        <select class="admin-status-select" data-id="${ord.id}">
          <option value="Pending" ${ord.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Dispatched" ${ord.status === 'Dispatched' ? 'selected' : ''}>Dispatched</option>
          <option value="Out for Delivery" ${ord.status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
          <option value="Delivered" ${ord.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Bind change listeners to status dropdown
  tbody.querySelectorAll('.admin-status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const orderId = select.getAttribute('data-id');
      const val = e.target.value;

      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: val })
        });
        if (res.ok) {
          showNotificationToast(`Order #${orderId} status set to: ${val}`);
          loadAdminDashboard();
        }
      } catch (err) {
        console.error("Order status update failed", err);
      }
    });
  });
}

// Render Products Tab
function renderAdminProductsTable() {
  const tbody = document.getElementById('admin-products-table-body');
  tbody.innerHTML = '';

  state.products.forEach(prod => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${prod.name}</strong></td>
      <td>${prod.category}</td>
      <td>$${prod.price.toFixed(2)}</td>
      <td>${prod.stock}</td>
      <td>${prod.offers.join(', ') || 'None'}</td>
      <td>
        <button class="btn btn-secondary btn-sm admin-edit-prod-btn" data-id="${prod.id}">Edit</button>
        <button class="btn btn-danger btn-sm admin-delete-prod-btn" data-id="${prod.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.admin-edit-prod-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const prod = state.products.find(p => p.id === id);
      if (prod) {
        populateProductEditForm(prod);
      }
    });
  });

  tbody.querySelectorAll('.admin-delete-prod-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm("Are you sure you want to delete this product?")) {
        try {
          const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showNotificationToast("Product deleted successfully");
            loadAdminDashboard();
            fetchProducts(); // Sync catalog front
          }
        } catch (e) {
          console.error("Delete failed", e);
        }
      }
    });
  });
}

function renderProductFormCoupons() {
  const box = document.getElementById('product-coupon-checkboxes');
  box.innerHTML = '';

  state.offers.forEach(off => {
    box.innerHTML += `
      <label>
        <input type="checkbox" name="prod-linked-coupons" value="${off.code}"> ${off.code}
      </label>
    `;
  });
}

function populateProductEditForm(product) {
  document.getElementById('product-form-title').textContent = "Edit Product";
  document.getElementById('edit-prod-id').value = product.id;
  document.getElementById('prod-name').value = product.name;
  document.getElementById('prod-category').value = product.category;
  document.getElementById('prod-price').value = product.price;
  document.getElementById('prod-stock').value = product.stock;
  document.getElementById('prod-nutrition').value = product.nutrition || '';
  document.getElementById('prod-desc').value = product.description || '';

  // Setup coupon checkboxes
  const checkboxes = document.getElementsByName('prod-linked-coupons');
  checkboxes.forEach(box => {
    box.checked = product.offers.includes(box.value);
  });

  // Show cancel button
  document.getElementById('cancel-edit-prod-btn').classList.remove('hidden');
  document.getElementById('save-prod-btn').textContent = "Update Product";
}

function resetProductForm() {
  document.getElementById('product-form-title').textContent = "Add New Product";
  document.getElementById('edit-prod-id').value = '';
  document.getElementById('admin-product-form').reset();
  document.getElementById('cancel-edit-prod-btn').classList.add('hidden');
  document.getElementById('save-prod-btn').textContent = "Add Product";
}

async function handleProductFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-prod-id').value;
  const name = document.getElementById('prod-name').value;
  const category = document.getElementById('prod-category').value;
  const price = document.getElementById('prod-price').value;
  const stock = document.getElementById('prod-stock').value;
  const nutrition = document.getElementById('prod-nutrition').value;
  const description = document.getElementById('prod-desc').value;

  const couponCheckboxes = document.getElementsByName('prod-linked-coupons');
  const offers = [];
  couponCheckboxes.forEach(box => {
    if (box.checked) offers.push(box.value);
  });

  const payload = { name, category, price, stock, nutrition, description, offers };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/products/${id}` : '/api/products';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showNotificationToast(id ? "Product updated successfully" : "New product added!");
      resetProductForm();
      loadAdminDashboard();
      fetchProducts(); // Sync catalog front
    }
  } catch (err) {
    console.error("Product save failed", err);
  }
}

// Render Offers Tab
function renderAdminOffersTable() {
  const tbody = document.getElementById('admin-offers-table-body');
  tbody.innerHTML = '';

  state.offers.forEach(off => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${off.code}</strong></td>
      <td>${off.description}</td>
      <td>${off.type}</td>
      <td>${off.value}</td>
      <td>$${off.minPurchase.toFixed(2)}</td>
      <td>${off.applicableCategories.join(', ') || 'All'}</td>
      <td>
        <button class="btn btn-danger btn-sm admin-delete-off-btn" data-id="${off.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.admin-delete-off-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm("Delete this promo coupon?")) {
        try {
          const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showNotificationToast("Offer deleted");
            loadAdminDashboard();
            fetchOffers(); // Sync offers list
          }
        } catch (e) {
          console.error("Delete offer failed", e);
        }
      }
    });
  });
}

async function handleOfferFormSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('off-code').value.trim().toUpperCase();
  const description = document.getElementById('off-desc').value;
  const type = document.getElementById('off-type').value;
  const value = document.getElementById('off-value').value;
  const minPurchase = document.getElementById('off-min').value;

  const catCheckboxes = document.getElementsByName('off-categories');
  const applicableCategories = [];
  catCheckboxes.forEach(box => {
    if (box.checked) applicableCategories.push(box.value);
  });

  const payload = { code, description, type, value, minPurchase, applicableCategories };

  try {
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showNotificationToast(`Coupon code ${code} created successfully!`);
      document.getElementById('admin-offer-form').reset();
      loadAdminDashboard();
      fetchOffers(); // Sync offers list
    } else {
      const data = await res.json();
      alert(data.error || "Failed to create coupon");
    }
  } catch (err) {
    console.error("Save offer failed", err);
  }
}
