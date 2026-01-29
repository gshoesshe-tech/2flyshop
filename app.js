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
// 2. FIX: Added logic for the Landing page
function initLanding() {
  const enterBtn = $("#enterBtn");
  const fade = $("#enterFade");
  const video = $("#landingVideo");
  const soundBtn = $("#soundBtn");

  // Handle Enter
  enterBtn?.addEventListener("click", () => {
    // Fade out effect
    fade.classList.add("is-on");
    // Wait for transition then go to shop
    setTimeout(() => {
      window.location.href = "./shop.html";
    }, 450);
  });

  // Handle Sound Toggle
  soundBtn?.addEventListener("click", () => {
    if(!video) return;
    video.muted = !video.muted;
    // Optional: Visual feedback
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


  // PRODUCTS dropdown toggle (UI only)
  const productsToggle = document.getElementById("productsToggle");
  const productsNav = document.querySelector(".productsNav");

  productsToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // prevent instant close
    productsNav?.classList.toggle("open");
    productsToggle?.setAttribute(
      "aria-expanded",
      productsNav?.classList.contains("open") ? "true" : "false"
    );
  });

  // Close dropdown after selection
  document.querySelectorAll(".productsDropdown .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      productsNav?.classList.remove("open");
      productsToggle?.setAttribute("aria-expanded", "false");
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!productsNav) return;
    if (!productsNav.contains(e.target)) {
      productsNav.classList.remove("open");
      productsToggle?.setAttribute("aria-expanded", "false");
    }
  });

  // HELP modal (UI only)
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");

  function openHelp() {
    if (!helpModal) return;
    helpModal.classList.add("is-open");
    helpModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeHelp() {
    if (!helpModal) return;
    helpModal.classList.remove("is-open");
    helpModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  helpBtn?.addEventListener("click", openHelp);
  helpModal?.querySelectorAll("[data-help-close='1']").forEach((el) => {
    el.addEventListener("click", closeHelp);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && helpModal?.classList.contains("is-open")) closeHelp();
  });

  const sb = getSupabase();
  const msgEl = document.getElementById('adminMsg');

  const setMsg = (text, isErr = false) => {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = isErr ? 'rgba(255,90,90,.95)' : 'rgba(255,255,255,.70)';
  };

  if (!sb) {
    setMsg('Supabase not configured in config.js', true);
    return;
  }

  const aName = $("#aName");
  const aPrice = $("#aPrice");
  const aCode = $("#aCode");
  const aSku = $("#aSku");
  const aCategory = $("#aCategory");
  const aStatus = $("#aStatus");
  const aSoldOut = $("#aSoldOut");
  const aImageUrl = $("#aImageUrl");
  const addUrlBtn = $("#addUrlBtn");
  const aFiles = $("#aFiles");
  const uploadFilesBtn = $("#uploadFilesBtn");
  const imgList = $("#imgList");
  const createProductBtn = $("#createProductBtn");
  const adminProducts = $("#adminProducts");

  let stagedImages = [];

  function renderStaged() {
    if (!imgList) return;
    imgList.innerHTML = stagedImages.map((url, idx) => `
      <div class="imgChip">
        <img src="${escapeHtmlAttr(url)}" alt="" loading="lazy" />
        <div class="imgChip__row">
          <button class="imgChip__btn" type="button" data-rm="${idx}">Remove</button>
          <span style="color:rgba(255,255,255,.45); font-size:11px;">${idx + 1}</span>
        </div>
      </div>
    `).join('');

    imgList.querySelectorAll('button[data-rm]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.getAttribute('data-rm'));
        stagedImages.splice(i, 1);
        renderStaged();
      });
    });
  }

  addUrlBtn?.addEventListener('click', () => {
    const u = (aImageUrl?.value || '').trim();
    if (!u) return;
    stagedImages.push(u);
    if (aImageUrl) aImageUrl.value = '';
    renderStaged();
  });

  async function uploadOne(file) {
    // Sanitize filename
    const safeName = String(file.name || 'image').replace(/[^a-z0-9_.-]/gi, '_');
    const path = `public/products/${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;

    const { error } = await sb.storage.from('product_images').upload(path, file, { upsert: false });
    if (error) throw error;

    const { data } = sb.storage.from('product_images').getPublicUrl(path);
    return data?.publicUrl || '';
  }

  uploadFilesBtn?.addEventListener('click', async () => {
    const files = Array.from(aFiles?.files || []);
    if (!files.length) return;

    uploadFilesBtn.disabled = true;
    setMsg('Uploading images…');

    try {
      for (const f of files) {
        const url = await uploadOne(f);
        if (url) stagedImages.push(url);
      }
      if (aFiles) aFiles.value = '';
      renderStaged();
      setMsg('Images uploaded ✅');
    } catch (e) {
      console.error(e);
      setMsg(`Upload failed: ${e?.message || e}`, true);
    } finally {
      uploadFilesBtn.disabled = false;
    }
  });

  async function loadAdminProducts() {
    if (!adminProducts) return;
    setMsg('Loading products…');

    const { data, error } = await sb.from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setMsg(`Load failed: ${error.message}`, true);
      return;
    }

    setMsg('');
    const list = data || [];
    adminProducts.innerHTML = list.map((p) => {
      const img = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.image_url || '');
      const meta = [
        p.code ? `Code: ${p.code}` : null,
        `₱${Number(p.price || 0)}`,
        p.sold_out ? 'SOLD OUT' : null,
      ].filter(Boolean).join(' • ');

      return `
        <div class="adminItem">
          <div class="adminItem__top">
            <div>
              <div class="adminItem__name">${escapeHtml(p.name || '')}</div>
              <div class="adminItem__meta">${escapeHtml(meta)}</div>
            </div>
            <div class="adminItem__btns">
              <button class="btn btn--ghost" type="button" data-del="${p.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    adminProducts.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if(!confirm("Are you sure?")) return;
        const id = btn.getAttribute('data-del');
        setMsg('Deleting…');
        const { error: delErr } = await sb.from('products').delete().eq('id', id);
        if (delErr) {
          setMsg(`Delete failed: ${delErr.message}`, true);
        } else {
          setMsg('Deleted ✅');
          loadAdminProducts();
        }
      });
    });
  }

  createProductBtn?.addEventListener('click', async () => {
    const name = (aName?.value || '').trim();
    const price = Number((aPrice?.value || '').trim());
    const code = (aCode?.value || '').trim();
    const sku = (aSku?.value || '').trim();
    const category = (aCategory?.value || 'Earrings');
    const status = (aStatus?.value || 'active');
    const sold_out = Boolean(aSoldOut?.checked);

    if (!name) return setMsg('Name is required.', true);
    
    // Create product object
    const payload = {
      name,
      price,
      code,
      sku,
      category,
      status,
      sold_out,
      images: stagedImages,
      image_url: stagedImages[0] || null // backward compat
    };

    createProductBtn.disabled = true;
    setMsg('Creating…');

    const { error } = await sb.from('products').insert(payload);

    if (error) {
      console.error(error);
      setMsg(`Failed: ${error.message}`, true);
    } else {
      setMsg('Created ✅');
      // Reset form
      if(aName) aName.value = "";
      if(aPrice) aPrice.value = "";
      if(aCode) aCode.value = "";
      if(aSku) aSku.value = "";
      stagedImages = [];
      renderStaged();
      loadAdminProducts();
    }
    createProductBtn.disabled = false;
  });

  loadAdminProducts();
}


// ---------------- BOOTSTRAP ----------------
function bootstrap() {
  const page = document.body?.dataset?.page;
  if (page === 'landing') initLanding();
  if (page === 'shop') initShop();
  if (page === 'admin') initAdmin();
}

document.addEventListener('DOMContentLoaded', bootstrap);
