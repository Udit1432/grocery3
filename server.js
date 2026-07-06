const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
// Serve static files from the root directory
app.use(express.static(__dirname));

// Utility functions to read/write JSON database
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading database file", err);
    return { users: [], products: [], offers: [], orders: [], notifications: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database file", err);
  }
}

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = readData();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  // Return user without password
  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Please provide name, email, and password" });
  }

  const db = readData();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: "Email already registered" });
  }

  const newUser = {
    id: 'user-' + Date.now(),
    name,
    email,
    password,
    role: 'customer',
    cashbackBalance: 0.0
  };

  db.users.push(newUser);
  writeData(db);

  const { password: _, ...safeUser } = newUser;
  res.json(safeUser);
});

// -------------------------------------------------------------
// Products Catalog Endpoints
// -------------------------------------------------------------
app.get('/api/products', (req, res) => {
  const db = readData();
  res.json(db.products);
});

// Admin Add Product
app.post('/api/products', (req, res) => {
  const { name, category, price, stock, description, nutrition, offers } = req.body;
  if (!name || !category || price === undefined || stock === undefined) {
    return res.status(400).json({ error: "Name, category, price, and stock are required" });
  }

  const db = readData();
  const newProduct = {
    id: 'prod-' + Date.now(),
    name,
    category,
    price: parseFloat(price),
    stock: parseInt(stock),
    description: description || '',
    nutrition: nutrition || '',
    offers: offers || []
  };

  db.products.push(newProduct);
  writeData(db);
  res.json(newProduct);
});

// Admin Edit Product
app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, price, stock, description, nutrition, offers } = req.body;

  const db = readData();
  const productIdx = db.products.findIndex(p => p.id === id);
  if (productIdx === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  db.products[productIdx] = {
    ...db.products[productIdx],
    name: name !== undefined ? name : db.products[productIdx].name,
    category: category !== undefined ? category : db.products[productIdx].category,
    price: price !== undefined ? parseFloat(price) : db.products[productIdx].price,
    stock: stock !== undefined ? parseInt(stock) : db.products[productIdx].stock,
    description: description !== undefined ? description : db.products[productIdx].description,
    nutrition: nutrition !== undefined ? nutrition : db.products[productIdx].nutrition,
    offers: offers !== undefined ? offers : db.products[productIdx].offers
  };

  writeData(db);
  res.json(db.products[productIdx]);
});

// Admin Delete Product
app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const db = readData();
  const productIdx = db.products.findIndex(p => p.id === id);
  if (productIdx === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  db.products.splice(productIdx, 1);
  writeData(db);
  res.json({ message: "Product deleted successfully" });
});

// -------------------------------------------------------------
// Offers Endpoints
// -------------------------------------------------------------
app.get('/api/offers', (req, res) => {
  const db = readData();
  res.json(db.offers);
});

// Admin Add Coupon/Offer
app.post('/api/offers', (req, res) => {
  const { code, description, type, value, minPurchase, applicableCategories } = req.body;
  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: "Code, type, and value are required" });
  }

  const db = readData();
  if (db.offers.find(o => o.code.toUpperCase() === code.toUpperCase())) {
    return res.status(400).json({ error: "Promo code already exists" });
  }

  const newOffer = {
    id: 'off-' + Date.now(),
    code: code.toUpperCase(),
    description: description || '',
    type, // 'percentage', 'cashback', 'bogo', 'flat'
    value: parseFloat(value),
    minPurchase: parseFloat(minPurchase || 0),
    applicableCategories: applicableCategories || []
  };

  db.offers.push(newOffer);
  writeData(db);
  res.json(newOffer);
});

// Admin Delete Offer
app.delete('/api/offers/:id', (req, res) => {
  const { id } = req.params;
  const db = readData();
  const index = db.offers.findIndex(o => o.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Offer not found" });
  }

  db.offers.splice(index, 1);
  writeData(db);
  res.json({ message: "Offer deleted successfully" });
});

// -------------------------------------------------------------
// Orders & Smart Offers Engine
// -------------------------------------------------------------
app.get('/api/orders', (req, res) => {
  const { userId } = req.query;
  const db = readData();

  if (userId) {
    const user = db.users.find(u => u.id === userId);
    if (user && user.role === 'admin') {
      return res.json(db.orders);
    }
    return res.json(db.orders.filter(o => o.userId === userId));
  }
  res.json(db.orders);
});

// Checkout Order
app.post('/api/orders', (req, res) => {
  const { userId, items, couponCode, address, useCashback } = req.body;
  if (!userId || !items || !items.length || !address) {
    return res.status(400).json({ error: "Incomplete order details (items, address, userId)" });
  }

  const db = readData();
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // 1. Calculate raw subtotals and check stock
  let subtotal = 0;
  const verifiedItems = [];

  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId);
    if (!product) {
      return res.status(404).json({ error: `Product ${item.name} not found` });
    }
    if (product.stock < item.quantity) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.stock}` });
    }

    subtotal += product.price * item.quantity;
    verifiedItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      category: product.category
    });
  }

  // 2. Process offer calculations (Smart Offer Engine)
  let discount = 0;
  let cashbackEarned = 0;
  let appliedOfferText = "None";

  if (couponCode) {
    const offer = db.offers.find(o => o.code.toUpperCase() === couponCode.toUpperCase());
    if (offer) {
      // Check minimum purchase requirement
      if (subtotal >= offer.minPurchase) {
        if (offer.type === 'percentage') {
          // Check if applicable to specific categories
          if (offer.applicableCategories.length > 0) {
            let discountableSum = 0;
            verifiedItems.forEach(item => {
              if (offer.applicableCategories.includes(item.category)) {
                discountableSum += item.price * item.quantity;
              }
            });
            discount = discountableSum * (offer.value / 100);
          } else {
            discount = subtotal * (offer.value / 100);
          }
          appliedOfferText = `${offer.code} (-$${discount.toFixed(2)})`;
        } else if (offer.type === 'flat') {
          discount = Math.min(offer.value, subtotal);
          appliedOfferText = `${offer.code} (-$${discount.toFixed(2)})`;
        } else if (offer.type === 'bogo') {
          // Buy 1 Get 1 free: for applicable categories, calculate savings
          let bogoDiscount = 0;
          const dairyItems = verifiedItems.filter(item => offer.applicableCategories.includes(item.category));
          dairyItems.forEach(item => {
            // Find how many pairs of the item exist
            const freeCount = Math.floor(item.quantity / 2);
            bogoDiscount += freeCount * item.price;
          });
          discount = bogoDiscount;
          appliedOfferText = `${offer.code} BOGO Dairy (-$${discount.toFixed(2)})`;
        } else if (offer.type === 'cashback') {
          cashbackEarned = subtotal * (offer.value / 100);
          appliedOfferText = `${offer.code} (Earned $${cashbackEarned.toFixed(2)} Cashback)`;
        }
      } else {
        return res.status(400).json({ error: `Coupon ${couponCode} requires a minimum order of $${offer.minPurchase.toFixed(2)}` });
      }
    } else {
      return res.status(400).json({ error: `Invalid promo code: ${couponCode}` });
    }
  }

  // Calculate delivery fee (free above $40)
  const deliveryFee = subtotal - discount >= 40 ? 0 : 3.99;

  // Calculate final cash total
  let totalPayable = subtotal - discount + deliveryFee;

  // Deduct user's cashback balance if checked
  let cashbackUsed = 0;
  if (useCashback && user.cashbackBalance > 0) {
    cashbackUsed = Math.min(user.cashbackBalance, totalPayable);
    totalPayable -= cashbackUsed;
    user.cashbackBalance -= cashbackUsed;
  }

  // Update user's cashback balance with newly earned cashback
  if (cashbackEarned > 0) {
    user.cashbackBalance += cashbackEarned;
  }

  // 3. Deduct stock and commit changes
  verifiedItems.forEach(item => {
    const prod = db.products.find(p => p.id === item.productId);
    prod.stock -= item.quantity;
  });

  // Create the Order
  const newOrder = {
    id: 'ord-' + Date.now().toString().slice(-6),
    userId,
    items: verifiedItems,
    subtotal: parseFloat(subtotal.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    cashbackEarned: parseFloat(cashbackEarned.toFixed(2)),
    cashbackUsed: parseFloat(cashbackUsed.toFixed(2)),
    deliveryFee: parseFloat(deliveryFee.toFixed(2)),
    total: parseFloat(totalPayable.toFixed(2)),
    status: 'Pending',
    deliveryAddress: address,
    timestamp: new Date().toLocaleString(),
    progress: 0,
    vehicleCoords: { x: 10, y: 80 }, // Start position (Store)
    appliedOffer: appliedOfferText
  };

  db.orders.push(newOrder);

  // Send system notification
  const newNotification = {
    id: 'notif-' + Date.now(),
    userId,
    message: `Order #${newOrder.id} has been placed successfully! Total: $${newOrder.total.toFixed(2)}`,
    type: 'order_status',
    timestamp: new Date().toLocaleTimeString()
  };
  db.notifications.unshift(newNotification);

  writeData(db);
  res.json({ order: newOrder, userCashback: user.cashbackBalance });
});

// Admin Update Order Status (Triggers simulation)
app.put('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Pending, Dispatched, Out for Delivery, Delivered

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  const db = readData();
  const order = db.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  order.status = status;
  if (status === 'Pending') {
    order.progress = 0;
    order.vehicleCoords = { x: 10, y: 80 };
  } else if (status === 'Dispatched') {
    order.progress = 25;
    order.vehicleCoords = { x: 30, y: 65 };
  } else if (status === 'Out for Delivery') {
    order.progress = 50;
    order.vehicleCoords = { x: 50, y: 50 };
  } else if (status === 'Delivered') {
    order.progress = 100;
    order.vehicleCoords = { x: 90, y: 20 };
  }

  // Create notifications
  const notification = {
    id: 'notif-' + Date.now(),
    userId: order.userId,
    message: `Order #${order.id} status updated to: ${status}!`,
    type: 'order_status',
    timestamp: new Date().toLocaleTimeString()
  };
  db.notifications.unshift(notification);

  writeData(db);
  res.json(order);
});

// -------------------------------------------------------------
// Notifications Endpoints
// -------------------------------------------------------------
app.get('/api/notifications', (req, res) => {
  const { userId } = req.query;
  const db = readData();

  if (userId) {
    // Show user-specific + general alerts
    const alerts = db.notifications.filter(n => n.userId === userId || !n.userId);
    return res.json(alerts);
  }
  res.json(db.notifications);
});

app.post('/api/notifications', (req, res) => {
  const { userId, message, type } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const db = readData();
  const newNotif = {
    id: 'notif-' + Date.now(),
    userId: userId || null, // null means global/broadcast
    message,
    type: type || 'offer',
    timestamp: new Date().toLocaleTimeString()
  };

  db.notifications.unshift(newNotif);
  writeData(db);
  res.json(newNotif);
});

// -------------------------------------------------------------
// Background Simulation Loop for Delivery Progress
// -------------------------------------------------------------
setInterval(() => {
  const db = readData();
  let changed = false;

  db.orders.forEach(order => {
    if (order.status === 'Out for Delivery') {
      if (order.progress < 95) {
        order.progress += 15;
        // Linear path from Store (10, 80) to Customer (90, 20)
        const t = order.progress / 100;
        order.vehicleCoords.x = Math.round(10 + t * 80);
        order.vehicleCoords.y = Math.round(80 - t * 60);
        changed = true;
      } else if (order.progress >= 95 && order.progress < 100) {
        order.progress = 100;
        order.status = 'Delivered';
        order.vehicleCoords.x = 90;
        order.vehicleCoords.y = 20;

        // Push delivery notification
        const deliveryNotif = {
          id: 'notif-' + Date.now(),
          userId: order.userId,
          message: `🚚 Order #${order.id} has been delivered at your doorstep!`,
          type: 'order_status',
          timestamp: new Date().toLocaleTimeString()
        };
        db.notifications.unshift(deliveryNotif);
        changed = true;
      }
    }
  });

  if (changed) {
    writeData(db);
  }
}, 5000); // Check and update coordinates every 5 seconds

// Start Server
app.listen(PORT, () => {
  console.log(`Grocery server is running on http://localhost:${PORT}`);
});
