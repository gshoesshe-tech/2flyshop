/* 2FLY Wholesale System (Fixed)
   - Handles Landing, Shop, and Admin logic
   - Requires Supabase setup in config.js
*/

const SUPABASE_URL = (window.__SUPABASE_URL__ || '').trim();
const SUPABASE_ANON_KEY = (window.__SUPABASE_ANON_KEY__ || '').trim();

let __sb = null;

// --- Helper Functions ---

// 1. FIX: Added the missing money formatting function
function money(val) {
  return '₱' + (Number(val) || 0).toLocaleString('en-US');
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase && typeof window.supabase.createClient === 'function');
}

function getSupabase() {
  if (!hasSupabase()) return null;
  if (!__sb) __sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return __sb;
}

function clampInt(v, min = 1) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || isNaN(n)) return min;
  return Math.max(min, n);
}

// Shortcut selectors
const $ = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => p.querySelectorAll(sel);


// ---------------- LANDING (index.html) ----------------
function initLanding() {
  const enterBtn = $("#enterBtn");
  const fade = $("#enterFade");
  const video = $("#landingVideo");
  const soundBtn = $("#soundBtn");

  // Handle Enter
  enterBtn?.addEventListener("click", () => {
    fade.classList.add("is-on");
    setTimeout(() => {
      window.location.href = "./shop.html";
    }, 450);
  });

  // Handle Sound Toggle
  soundBtn?.addEventListener("click", () => {
    if(!video) return;
    video.muted = !video.muted;
    soundBtn.style.opacity = video.muted ? "0.6" : "1";
  });
}


// ---------------- SHOP (shop.html) ----------------
const cart = {
  items: [],
};

function loadCart() {
  try {
    cart.items = JSON.parse(localStorage.getItem("cart_v1") || "[]") || [];
  } catch {
    cart.items = [];
  }
}

function saveCart() {
  localStorage.setItem("cart_v1", JSON.stringify(cart.items));
}

function cartTotalQty() {
  return cart.items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
}

function cartSubtotal() {
  return cart.items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
}

function findCartItem(id) {
  return cart.items.find(x => String(x.id) === String(id));
}

function addToCart(prod, qty) {
  const q = clampInt(qty, 1);
  const existing = findCartItem(prod.id);
  if (existing) existing.qty = clampInt((existing.qty || 0) + q, 1);
  else {
    cart.items.push({
      id: prod.id,
      name: prod.name,
      price: Number(prod.price) || 0,
      code: prod.code || "",
      sku: prod.sku || "",
      category: prod.category || "",
      image: (prod.images && prod.images[0]) || prod.image_url || "",
      qty: q
    });
  }
  saveCart();
}

function initShop() {
  loadCart();
  wireCartUI();

  const sb = getSupabase();
  const grid = $("#productsGrid");
  const empty = $("#emptyState");

  const pills = $$(".pill");
  let activeFilter = "Earrings";

  pills.forEach(p => {
    p.addEventListener("click", () => {
      pills.forEach(x => x.classList.remove("is-active"));
      p.classList.add("is-active");
      activeFilter = p.dataset.filter;
      renderProducts(currentProducts, activeFilter);
    });
  });

  let currentProducts = [];

  async function fetchProducts() {
    if (!sb) {
      empty.textContent = "Supabase not connected. Check config.js.";
      empty.hidden = false;
      return;
    }

    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      empty.hidden = false;
      empty.textContent = "Error loading products.";
      return;
    }

    currentProducts = (data || [])
      .filter(p => (p.status || "active") === "active")
      .filter(p => p.sold_out !== true);

    renderProducts(currentProducts, activeFilter);
  }

  function renderProducts(list, filter) {
    const filtered = (filter === "ALL")
      ? list
      : list.filter(p => String(p.category || "Earrings").toLowerCase() === String(filter).toLowerCase());

    grid.innerHTML = "";
    empty.hidden = filtered.length !== 0;

    filtered.forEach(prod => {
      const img = (prod.images && prod.images[0]) || prod.image_url || "";
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img class="card__img" src="${escapeHtmlAttr(img)}" alt="${escapeHtmlAttr(prod.name || "")}" onerror="this.style.opacity=.2" />
        <div class="card__body">
          <div class="card__name">${escapeHtml(prod.name || "")}</div>
          <div class="card__price">${money(prod.price)}</div>
        </div>
      `;
      card.addEventListener("click", () => openProductModal(prod));
      grid.appendChild(card);
    });
  }

  const modal = $("#productModal");
  const modalCloseEls = $$("[data-close='1']", modal);
  const pMain = $("#pMainImg");
  const pThumbs = $("#pThumbs");
  const pName = $("#pName");
  const pPrice = $("#pPrice");
  const pCategory = $("#pCategory");
  const pSku = $("#pSku");
  const pCode = $("#pCode");
  const pMinus = $("#pMinus");
  const pPlus = $("#pPlus");
  const pQty = $("#pQty");
  const pAddBtn = $("#pAddBtn");

  let currentProd = null;

  function openProductModal(prod) {
    currentProd = normalizeProduct(prod);
    const imgs = currentProd.images.length ? currentProd.images : [currentProd.image_url].filter(Boolean);
    pMain.src = imgs[0] || "";
    pMain.alt = currentProd.name;

    pThumbs.innerHTML = "";
    imgs.forEach((u) => {
      const b = document.createElement("button");
      b.className = "thumb";
      b.type = "button";
      b.innerHTML = `<img src="${escapeHtmlAttr(u)}" alt="" />`;
      b.addEventListener("click", () => { pMain.src = u; });
      pThumbs.appendChild(b);
    });

    pName.textContent = currentProd.name;
    pPrice.textContent = money(currentProd.price);
    pCategory.textContent = currentProd.category || "";
    pSku.textContent = currentProd.sku || "";
    pCode.textContent = currentProd.code || "";
    pQty.value = "1";
    syncAddBtn();

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeProductModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    currentProd = null;
  }

  modalCloseEls.forEach(el => el.addEventListener("click", closeProductModal));
  function syncAddBtn() {
    const q = clampInt(pQty.value, 1);
    pAddBtn.textContent = `ADD ${q} TO CART`;
  }

  pQty.addEventListener("input", () => {
    if (!pQty.value) return syncAddBtn();
    const q = clampInt(pQty.value, 1);
    pQty.value = String(q);
    syncAddBtn();
  });

  pMinus.addEventListener("click", () => {
    const q = clampInt(pQty.value, 1);
    pQty.value = String(Math.max(1, q - 1));
    syncAddBtn();
  });

  pPlus.addEventListener("click", () => {
    const q = clampInt(pQty.value, 1);
    pQty.value = String(q + 1);
    syncAddBtn();
  });

  pAddBtn.addEventListener("click", () => {
    if (!currentProd) return;
    const q = clampInt(pQty.value, 1);
    addToCart(currentProd, q);
    updateCartUI();
    closeProductModal();
    window.openCart();
  });

  fetchProducts();
  updateCartUI();
}

function normalizeProduct(p) {
  return {
    id: p.id,
    name: p.name || "",
    price: Number(p.price) || 0,
    code: p.code || "",
    sku: p.sku || "",
    category: p.category || "Earrings",
    image_url: p.image_url || "",
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : []
  };
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeHtmlAttr(s) {
  return escapeHtml(s || "");
}


// ---------------- CART UI + CHECKOUT ----------------
function wireCartUI() {
  const cartBtn = $("#cartBtn");
  const overlay = $("#cartOverlay");
  const drawer = $("#cartDrawer");
  const closeBtn = $("#closeCartBtn");

  function openCart() {
    if(!overlay || !drawer) return;
    overlay.hidden = false;
    drawer.classList.add("is-open");
    updateCartUI();
  }
  function closeCart() {
    if(!overlay || !drawer) return;
    overlay.hidden = true;
    drawer.classList.remove("is-open");
  }

  cartBtn?.addEventListener("click", openCart);
  overlay?.addEventListener("click", closeCart);
  closeBtn?.addEventListener("click", closeCart);
  window.openCart = openCart;
  window.closeCart = closeCart;

  const checkoutBtn = $("#checkoutBtn");
  const checkoutModal = $("#checkoutModal");
  const checkoutCloseEls = $$("[data-close-checkout='1']", checkoutModal);
  const copyBtn = $("#copyOrderBtn");

  checkoutBtn?.addEventListener("click", () => {
    if (!cart.items.length) return;
    refreshOrderText();
    closeCart();
    checkoutModal.classList.add("is-open");
  });

  checkoutCloseEls.forEach(el => el.addEventListener("click", () => checkoutModal.classList.remove("is-open")));

  copyBtn?.addEventListener("click", async () => {
    const t = $("#orderText")?.value || "";
    try {
      await navigator.clipboard.writeText(t);
      const oldText = copyBtn.textContent;
      copyBtn.textContent = "COPIED ✅";
      setTimeout(() => (copyBtn.textContent = oldText), 1500);
    } catch {
      const ta = $("#orderText");
      ta?.select();
      document.execCommand("copy");
    }
  });

  ["#cName", "#cPhone", "#cAddress", "#cNotes"].forEach(sel => {
    $(sel)?.addEventListener("input", refreshOrderText);
  });

  // --- UPDATED ORDER FORM LOGIC ---
  function refreshOrderText() {
    const name = ($("#cName")?.value || "").trim();
    const phone = ($("#cPhone")?.value || "").trim();
    const address = ($("#cAddress")?.value || "").trim();
    const notes = ($("#cNotes")?.value || "").trim();

    const lines = [];
    lines.push("🛒 ORDER FORM – 2FLY.GALLERIA");
    lines.push(`Name: ${name}`);
    lines.push(`Phone: ${phone}`);
    lines.push(`Address: ${address}`);
    if (notes) lines.push(`Notes: ${notes}`);
    lines.push("");

    // 1. Group items by Category
    const grouped = {};
    cart.items.forEach(it => {
      const cat = (it.category || "General").toUpperCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    });

    // 2. Build segments per Category
    for (const category in grouped) {
      let catQty = 0;
      let catSubtotalValue = 0;

      lines.push(`[ ${category} ]`);
      lines.push("");

      grouped[category].forEach(it => {
        const qty = Number(it.qty) || 0;
        const price = Number(it.price) || 0;
        // Prioritize Code/SKU to save space
        const identifier = (it.code || it.sku || it.name || "N/A").trim();
        
        lines.push(`${identifier} x${qty}`);
        
        catQty += qty;
        catSubtotalValue += (price * qty);
      });

      lines.push("");
      lines.push(`Total Quantity: ${catQty}`);
      lines.push(`Subtotal: ${money(catSubtotalValue)}`);
      lines.push("--------------------------");
      lines.push("");
    }

    // Grand Totals at bottom
    lines.push(`GRAND TOTAL QTY: ${cartTotalQty()}`);
    lines.push(`GRAND TOTAL AMT: ${money(cartSubtotal())}`);

    const out = lines.join("\n");
    const ta = $("#orderText");
    if (ta) ta.value = out;
  }
}

function updateCartUI() {
  const count = $("#cartCount");
  const itemsWrap = $("#cartItems");
  const subtotalEl = $("#cartSubtotal");
  const totalQtyEl = $("#cartTotalQty");

  if (count) count.textContent = String(cartTotalQty());
  if (subtotalEl) subtotalEl.textContent = money(cartSubtotal());
  if (totalQtyEl) totalQtyEl.textContent = String(cartTotalQty());

  if (!itemsWrap) return;
  itemsWrap.innerHTML = "";
  if (!cart.items.length) {
    itemsWrap.innerHTML = '<div style="color:rgba(255,255,255,.55);padding:14px 0;">Your cart is empty.</div>';
    return;
  }

  cart.items.forEach(it => {
    const row = document.createElement("div");
    row.className = "cartItem";
    row.innerHTML = `
      <img class="cartItem__img" src="${escapeHtmlAttr(it.image || "")}" alt="" onerror="this.style.opacity=.2" />
      <div>
        <div class="cartItem__name">${escapeHtml(it.name || "")}</div>
        <div class="cartItem__meta">${it.code ? `Code: ${escapeHtml(it.code)}` : ""}</div>
        <div class="cartItem__row">
          <div class="cartQty">
            <button type="button" data-dec="${it.id}">−</button>
            <input type="number" min="1" step="1" value="${Number(it.qty) || 1}" data-qty="${it.id}" />
            <button type="button" data-inc="${it.id}">+</button>
          </div>
          <div style="color:rgba(255,255,255,.75);font-weight:700;">${money((Number(it.price)||0) * (Number(it.qty)||0))}</div>
        </div>
      </div>
      <button class="trashBtn" type="button" data-del="${it.id}">🗑</button>
    `;
    itemsWrap.appendChild(row);
  });

  // UI Events
  itemsWrap.querySelectorAll("[data-dec]").forEach(btn => btn.addEventListener("click", () => {
    const item = findCartItem(btn.dataset.dec);
    if (item) { item.qty = Math.max(1, item.qty - 1); saveCart(); updateCartUI(); }
  }));
  itemsWrap.querySelectorAll("[data-inc]").forEach(btn => btn.addEventListener("click", () => {
    const item = findCartItem(btn.dataset.inc);
    if (item) { item.qty += 1; saveCart(); updateCartUI(); }
  }));
  itemsWrap.querySelectorAll("[data-qty]").forEach(inp => inp.addEventListener("input", () => {
    const item = findCartItem(inp.dataset.qty);
    if (item) { item.qty = clampInt(inp.value, 1); saveCart(); updateCartUI(); }
  }));
  itemsWrap.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => {
    cart.items = cart.items.filter(x => String(x.id) !== String(btn.dataset.del));
    saveCart(); updateCartUI();
  }));
}


// ---------------- ADMIN (admin.html) ----------------
function initAdmin() {
  const sb = getSupabase();
  const msgEl = document.getElementById('adminMsg');

  const setMsg = (text, isErr = false) => {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = isErr ? 'rgba(255,90,90,.95)' : 'rgba(255,255,255,.70)';
  };

  if (!sb) { setMsg('Supabase not configured', true); return; }

  const aName = $("#aName"), aPrice = $("#aPrice"), aCode = $("#aCode"), aSku = $("#aSku"), aCategory = $("#aCategory"), aStatus = $("#aStatus"), aSoldOut = $("#aSoldOut"), aImageUrl = $("#aImageUrl"), addUrlBtn = $("#addUrlBtn"), aFiles = $("#aFiles"), uploadFilesBtn = $("#uploadFilesBtn"), imgList = $("#imgList"), createProductBtn = $("#createProductBtn"), adminProducts = $("#adminProducts");

  let stagedImages = [];

  function renderStaged() {
    if (!imgList) return;
    imgList.innerHTML = stagedImages.map((url, idx) => `
      <div class="imgChip">
        <img src="${escapeHtmlAttr(url)}" />
        <div class="imgChip__row"><button class="imgChip__btn" type="button" data-rm="${idx}">Remove</button></div>
      </div>
    `).join('');
    imgList.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { stagedImages.splice(b.dataset.rm, 1); renderStaged(); }));
  }

  addUrlBtn?.addEventListener('click', () => {
    const u = aImageUrl.value.trim();
    if (u) { stagedImages.push(u); aImageUrl.value = ''; renderStaged(); }
  });

  uploadFilesBtn?.addEventListener('click', async () => {
    const files = Array.from(aFiles?.files || []);
    if (!files.length) return;
    uploadFilesBtn.disabled = true; setMsg('Uploading...');
    try {
      for (const f of files) {
        const path = `public/${Date.now()}_${f.name.replace(/[^a-z0-9.]/gi, '_')}`;
        await sb.storage.from('product_images').upload(path, f);
        stagedImages.push(sb.storage.from('product_images').getPublicUrl(path).data.publicUrl);
      }
      aFiles.value = ''; renderStaged(); setMsg('Uploaded ✅');
    } catch (e) { setMsg('Upload failed', true); }
    finally { uploadFilesBtn.disabled = false; }
  });

  async function loadAdminProducts() {
    if (!adminProducts) return;
    const { data } = await sb.from('products').select('*').order('created_at', { ascending: false });
    adminProducts.innerHTML = (data || []).map(p => `
      <div class="adminItem">
        <div class="adminItem__top">
          <div><div class="adminItem__name">${escapeHtml(p.name)}</div></div>
          <button class="btn btn--ghost" data-del="${p.id}">Delete</button>
        </div>
      </div>`).join('');
    adminProducts.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if(confirm("Delete?")) { await sb.from('products').delete().eq('id', b.dataset.del); loadAdminProducts(); }
    }));
  }

  createProductBtn?.addEventListener('click', async () => {
    const payload = { name: aName.value.trim(), price: Number(aPrice.value), code: aCode.value.trim(), sku: aSku.value.trim(), category: aCategory.value, status: aStatus.value, sold_out: aSoldOut.checked, images: stagedImages };
    if (!payload.name) return setMsg('Name required', true);
    await sb.from('products').insert(payload);
    setMsg('Created ✅'); loadAdminProducts();
  });

  loadAdminProducts();
}

function bootstrap() {
  const p = document.body?.dataset?.page;
  if (p === 'landing') initLanding();
  if (p === 'shop') initShop();
  if (p === 'admin') initAdmin();
}
document.addEventListener('DOMContentLoaded', bootstrap);
