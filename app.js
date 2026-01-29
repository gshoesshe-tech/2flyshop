/* 2FLY Wholesale System - Updated for New Category Filter */
const SUPABASE_URL = (window.__SUPABASE_URL__ || '').trim();
const SUPABASE_ANON_KEY = (window.__SUPABASE_ANON_KEY__ || '').trim();

let __sb = null;

// --- Helper Functions ---
function money(val) {
  return '₱' + (Number(val) || 0).toLocaleString('en-US');
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
}

function getSupabase() {
  if (!hasSupabase()) return null;
  if (!__sb) __sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return __sb;
}

function clampInt(v, min = 1) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && !isNaN(n)) ? Math.max(min, n) : min;
}

const $ = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => p.querySelectorAll(sel);


// ---------------- SHOP LOGIC ----------------
let allProducts = []; // Store fetched products here

function initShop() {
  loadCart();
  wireCartUI();

  const sb = getSupabase();
  const grid = $("#productsGrid");
  const loading = $("#loadingState");
  const empty = $("#emptyState");
  
  // NEW: Select buttons by .cat-btn instead of .pill
  const catBtns = $$(".cat-btn");
  let activeFilter = "ALL"; // Default to ALL

  // 1. Setup Filter Click Events
  catBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // Remove active class from all
      catBtns.forEach(b => b.classList.remove("is-active"));
      // Add to clicked
      btn.classList.add("is-active");
      
      // Get filter value
      activeFilter = btn.getAttribute("data-filter");
      renderProducts();
    });
  });

  // 2. Fetch Data
  async function fetchProducts() {
    if (!sb) {
      if(loading) loading.textContent = "Supabase Config Error";
      return;
    }

    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      if(loading) loading.textContent = "Error loading products.";
      return;
    }

    // Filter out inactive items
    allProducts = (data || [])
      .filter(p => (p.status || "active") === "active")
      .filter(p => p.sold_out !== true); // Hide sold out if desired, or keep them

    if(loading) loading.style.display = 'none';
    
    // Initial Render
    renderProducts();
  }

  // 3. Render
  function renderProducts() {
    const list = allProducts;
    
    // Filter logic
    const filtered = (activeFilter === "ALL")
      ? list
      : list.filter(p => String(p.category || "").toLowerCase() === activeFilter.toLowerCase());

    grid.innerHTML = "";
    
    if (filtered.length === 0) {
      if(empty) empty.hidden = false;
    } else {
      if(empty) empty.hidden = true;
      
      filtered.forEach(prod => {
        // Handle image
        const img = (prod.images && prod.images[0]) || prod.image_url || "";
        
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <img class="card__img" src="${escapeHtmlAttr(img)}" alt="${escapeHtmlAttr(prod.name)}" loading="lazy" onerror="this.style.opacity=0.3" />
          <div class="card__body">
            <div class="card__name">${escapeHtml(prod.name)}</div>
            <div class="card__price">${money(prod.price)}</div>
          </div>
        `;
        card.addEventListener("click", () => openProductModal(prod));
        grid.appendChild(card);
      });
    }
  }

  // --- Modal Logic ---
  const modal = $("#productModal");
  const modalCloseEls = $$("[data-close='1']", modal);
  
  // Elements inside modal
  const pMain = $("#pMainImg");
  const pThumbs = $("#pThumbs");
  const pName = $("#pName");
  const pPrice = $("#pPrice");
  const pCategory = $("#pCategory");
  const pCode = $("#pCode");
  const pQty = $("#pQty");
  const pAddBtn = $("#pAddBtn");
  const pMinus = $("#pMinus");
  const pPlus = $("#pPlus");

  let currentProd = null;

  function openProductModal(prod) {
    currentProd = prod;
    
    const imgs = (prod.images && prod.images.length) ? prod.images : [prod.image_url].filter(Boolean);
    const mainSrc = imgs[0] || "";

    if(pMain) pMain.src = mainSrc;
    
    if(pThumbs) {
      pThumbs.innerHTML = "";
      if (imgs.length > 1) {
        imgs.forEach(src => {
          const t = document.createElement("button");
          t.className = "thumb";
          t.innerHTML = `<img src="${src}" />`;
          t.onclick = () => { if(pMain) pMain.src = src; };
          pThumbs.appendChild(t);
        });
      }
    }

    if(pName) pName.textContent = prod.name;
    if(pPrice) pPrice.textContent = money(prod.price);
    if(pCategory) pCategory.textContent = prod.category || "";
    if(pCode) pCode.textContent = prod.code || "";
    
    if(pQty) pQty.value = "1";
    
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; // Prevent background scroll
  }

  function closeProductModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    currentProd = null;
  }

  modalCloseEls.forEach(el => el.addEventListener("click", closeProductModal));

  // Qty Logic
  if(pMinus) pMinus.onclick = () => {
    const v = clampInt(pQty.value, 1);
    pQty.value = Math.max(1, v - 1);
  };
  if(pPlus) pPlus.onclick = () => {
    const v = clampInt(pQty.value, 1);
    pQty.value = v + 1;
  };

  // Add to Cart
  if(pAddBtn) pAddBtn.onclick = () => {
    if(!currentProd) return;
    const q = clampInt(pQty.value, 1);
    addToCart(currentProd, q);
    closeProductModal();
    window.openCart();
  };

  fetchProducts();
}


// ---------------- CART SYSTEM ----------------
const cart = { items: [] };

function loadCart() {
  try { cart.items = JSON.parse(localStorage.getItem("cart_v2") || "[]"); } 
  catch { cart.items = []; }
}
function saveCart() {
  localStorage.setItem("cart_v2", JSON.stringify(cart.items));
  updateCartUI();
}

function addToCart(prod, qty) {
  const existing = cart.items.find(x => x.id === prod.id);
  if(existing) {
    existing.qty += qty;
  } else {
    cart.items.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      image: (prod.images && prod.images[0]) || prod.image_url,
      code: prod.code,
      sku: prod.sku,
      qty: qty
    });
  }
  saveCart();
}

function updateCartUI() {
  const countBadge = $("#cartCount");
  const itemsWrap = $("#cartItems");
  const subTotalEl = $("#cartSubtotal");
  const qtyTotalEl = $("#cartTotalQty");

  let totalP = 0; 
  let totalQ = 0;

  cart.items.forEach(item => {
    totalP += (item.price * item.qty);
    totalQ += item.qty;
  });

  if(countBadge) countBadge.textContent = totalQ;
  if(subTotalEl) subTotalEl.textContent = money(totalP);
  if(qtyTotalEl) qtyTotalEl.textContent = totalQ;

  // Render Items in Drawer
  if(itemsWrap) {
    itemsWrap.innerHTML = "";
    if(cart.items.length === 0) {
      itemsWrap.innerHTML = `<div style="text-align:center; padding:20px; color:#666;">Cart is empty</div>`;
      return;
    }

    cart.items.forEach(item => {
      const el = document.createElement("div");
      el.className = "cartItem";
      el.innerHTML = `
        <img class="cartItem__img" src="${escapeHtmlAttr(item.image)}" />
        <div>
          <div class="cartItem__name">${escapeHtml(item.name)}</div>
          <div class="cartItem__meta">${item.code || ''}</div>
          <div class="cartQty">
            <button class="cDec" data-id="${item.id}">-</button>
            <input readonly value="${item.qty}" />
            <button class="cInc" data-id="${item.id}">+</button>
            <div style="margin-left:auto; font-weight:700; font-size:13px;">
              ${money(item.price * item.qty)}
            </div>
            <button class="cDel" data-id="${item.id}" style="background:none; color:#666; margin-left:10px;">×</button>
          </div>
        </div>
      `;
      itemsWrap.appendChild(el);
    });

    // Event Delegation for Cart Buttons
    itemsWrap.querySelectorAll('.cInc').forEach(b => b.onclick = () => modQty(b.dataset.id, 1));
    itemsWrap.querySelectorAll('.cDec').forEach(b => b.onclick = () => modQty(b.dataset.id, -1));
    itemsWrap.querySelectorAll('.cDel').forEach(b => b.onclick = () => rmItem(b.dataset.id));
  }
}

function modQty(id, change) {
  const item = cart.items.find(x => String(x.id) === String(id));
  if(!item) return;
  item.qty += change;
  if(item.qty < 1) item.qty = 1;
  saveCart();
}
function rmItem(id) {
  cart.items = cart.items.filter(x => String(x.id) !== String(id));
  saveCart();
}

function wireCartUI() {
  const btn = $("#cartBtn");
  const close = $("#closeCartBtn");
  const overlay = $("#cartOverlay");
  const drawer = $("#cartDrawer");

  window.openCart = () => {
    if(drawer) drawer.classList.add("is-open");
    if(overlay) overlay.hidden = false;
  };
  const closeC = () => {
    if(drawer) drawer.classList.remove("is-open");
    if(overlay) overlay.hidden = true;
  };

  if(btn) btn.onclick = window.openCart;
  if(close) close.onclick = closeC;
  if(overlay) overlay.onclick = closeC;

  // Checkout Logic
  const coBtn = $("#checkoutBtn");
  const coModal = $("#checkoutModal");
  const coClose = $$("[data-close-checkout='1']");
  
  if(coBtn) coBtn.onclick = () => {
    if(cart.items.length === 0) return alert("Cart is empty");
    closeC(); // Close drawer
    updateOrderForm();
    if(coModal) {
      coModal.classList.add("is-open");
      coModal.setAttribute("aria-hidden", "false");
    }
  };

  coClose.forEach(b => b.onclick = () => {
    if(coModal) {
      coModal.classList.remove("is-open");
      coModal.setAttribute("aria-hidden", "true");
    }
  });
  
  // Inputs listener to update order text
  ["#cName", "#cPhone", "#cAddress", "#cNotes"].forEach(s => {
    const el = $(s);
    if(el) el.oninput = updateOrderForm;
  });

  // Copy
  const cpBtn = $("#copyOrderBtn");
  if(cpBtn) cpBtn.onclick = () => {
    const txt = $("#orderText");
    if(txt) {
      txt.select();
      document.execCommand("copy");
      const old = cpBtn.textContent;
      cpBtn.textContent = "COPIED! ✅";
      setTimeout(()=>cpBtn.textContent=old, 1500);
    }
  };
}

function updateOrderForm() {
  const name = $("#cName")?.value || "";
  const phone = $("#cPhone")?.value || "";
  const addr = $("#cAddress")?.value || "";
  const notes = $("#cNotes")?.value || "";

  let total = 0;
  const itemsTxt = cart.items.map(i => {
    total += i.price * i.qty;
    return `• ${i.qty}x ${i.name} (${i.code||'-'})`;
  }).join("\n");

  const full = `🛒 ORDER FORM - 2FLY!GALLERIA
---------------------------
Name: ${name}
Phone: ${phone}
Address: ${addr}
Notes: ${notes}

ORDER DETAILS:
${itemsTxt}

TOTAL: ${money(total)}
`;
  const box = $("#orderText");
  if(box) box.value = full;
}


// ---------------- UTILS ----------------
function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeHtmlAttr(s) {
  return escapeHtml(s);
}

// ---------------- BOOTSTRAP ----------------
function bootstrap() {
  const p = document.body.dataset.page;
  if(p === 'shop') initShop();
  else if(p === 'landing' && typeof initLanding === 'function') initLanding(); 
  // Admin logic stays in previous admin file or can be merged here
}

document.addEventListener("DOMContentLoaded", bootstrap);
