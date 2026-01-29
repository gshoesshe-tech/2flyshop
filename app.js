/* 2FLY Wholesale System (Updated)
   - Added Size Selector for "Close Caps" only
   - Added Admin Toggle buttons (Hide/Show, Sold Out) to preserve product order
*/

const SUPABASE_URL = (window.__SUPABASE_URL__ || '').trim();
const SUPABASE_ANON_KEY = (window.__SUPABASE_ANON_KEY__ || '').trim();

let __sb = null;

// --- Helper Functions ---

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

const $ = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => p.querySelectorAll(sel);


// --- PAGE LOGIC ---

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;

  if (page === 'landing') {
    const btn = $('#enterBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        const fade = document.createElement('div');
        fade.className = 'landing__fade';
        document.body.appendChild(fade);
        requestAnimationFrame(() => fade.classList.add('is-on'));
        setTimeout(() => {
          window.location.href = './shop.html';
        }, 360);
      });
    }
  }

  if (page === 'shop') {
    initShop();
  }

  if (page === 'admin') {
    initAdmin();
  }
});


/* ===========================
   SHOP LOGIC
   =========================== */
let allProducts = [];
let cart = [];
let activeFilter = "Earrings"; 

async function initShop() {
  const sb = getSupabase();
  const grid = $('#productsGrid');
  const empty = $('#emptyState');

  // --- Products Dropdown Logic ---
  const productsNav = $('.productsNav');
  const productsToggle = $('#productsToggle');
  const productsDropdown = $('.productsDropdown');
  const pills = $$('.pill', productsDropdown);

  if (productsToggle) {
    productsToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        productsNav.classList.toggle('open');
        productsToggle.setAttribute('aria-expanded', productsNav.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
        if (!productsNav.contains(e.target)) {
            productsNav.classList.remove('open');
            productsToggle.setAttribute('aria-expanded', 'false');
        }
    });
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('is-active'));
            pill.classList.add('is-active');
            activeFilter = pill.dataset.filter;
            productsNav.classList.remove('open');
            productsToggle.setAttribute('aria-expanded', 'false');
            renderGrid(allProducts);
        });
    });
  }

  // Help & Cart Toggles
  const helpBtn = $('#helpBtn');
  const helpModal = $('#helpModal');
  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => helpModal.classList.add('is-open'));
    $$('[data-help-close]').forEach(el => el.addEventListener('click', () => helpModal.classList.remove('is-open')));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') helpModal.classList.remove('is-open');
    });
  }

  const cartBtn = $('#cartBtn');
  const cartDrawer = $('#cartDrawer');
  const cartOverlay = $('#cartOverlay');
  const closeCartBtn = $('#closeCartBtn');

  function toggleCart(show) {
    cartDrawer.classList.toggle('is-open', show);
    cartOverlay.hidden = !show;
  }
  cartBtn.addEventListener('click', () => toggleCart(true));
  closeCartBtn.addEventListener('click', () => toggleCart(false));
  cartOverlay.addEventListener('click', () => toggleCart(false));

  // Checkout
  const checkoutBtn = $('#checkoutBtn');
  const checkoutModal = $('#checkoutModal');
  const copyOrderBtn = $('#copyOrderBtn');

  checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) return alert("Cart is empty!");
    toggleCart(false);
    checkoutModal.classList.add('is-open');
    generateOrderForm();
  });

  $$('[data-close-checkout]').forEach(el => {
    el.addEventListener('click', () => checkoutModal.classList.remove('is-open'));
  });

  ['cName','cPhone','cAddress','cNotes'].forEach(id => {
    const el = $('#'+id);
    if(el) el.addEventListener('input', generateOrderForm);
  });

  copyOrderBtn.addEventListener('click', () => {
    const txt = $('#orderText');
    txt.select();
    txt.setSelectionRange(0, 99999);
    document.execCommand('copy');
    const old = copyOrderBtn.textContent;
    copyOrderBtn.textContent = "COPIED!";
    setTimeout(() => copyOrderBtn.textContent = old, 2000);
  });

  // Load Products
  if (!sb) {
    empty.textContent = "Setup Supabase in config.js first.";
    empty.hidden = false;
    return;
  }

  // FETCH: Only active items for customers
  const { data, error } = await sb
    .from('products')
    .select('*')
    .eq('status', 'active') 
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error(error);
    empty.textContent = "Error loading products.";
    empty.hidden = false;
    return;
  }

  allProducts = data;
  renderGrid(allProducts);

  function renderGrid(products) {
    grid.innerHTML = '';

    let filtered = products;
    if (activeFilter !== 'All' && activeFilter) {
       filtered = products.filter(p => p.category === activeFilter);
    }

    if (filtered.length === 0) {
      empty.textContent = "No products found in this category.";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    filtered.forEach(p => {
      let img = p.image_url;
      if (Array.isArray(p.images) && p.images.length > 0) img = p.images[0];

      const el = document.createElement('div');
      el.className = 'card';
      // Visual cue for sold out
      if(p.sold_out) el.style.opacity = '0.7';

      el.innerHTML = `
        <img class="card__img" src="${img || ''}" loading="lazy" />
        <div class="card__body">
          <div class="card__name">${p.name}</div>
          <div class="card__price">${money(p.price)}</div>
        </div>
        ${p.sold_out ? '<div style="position:absolute;top:10px;right:10px;background:#c00;color:#fff;font-size:10px;padding:4px 8px;font-weight:bold;">SOLD OUT</div>' : ''}
      `;
      el.addEventListener('click', () => openProduct(p));
      grid.appendChild(el);
    });
  }

  // --- Product Detail Modal ---
  const pModal = $('#productModal');
  const pMainImg = $('#pMainImg');
  const pThumbs = $('#pThumbs');
  const pName = $('#pName');
  const pPrice = $('#pPrice');
  const pCategory = $('#pCategory');
  const pCode = $('#pCode');
  const pQty = $('#pQty');
  const pMinus = $('#pMinus');
  const pPlus = $('#pPlus');
  const pAddBtn = $('#pAddBtn');

  // DYNAMIC SIZING UI: Create the element once, insert it into DOM
  let pSizeRow = document.getElementById('pSizeRow');
  if (!pSizeRow) {
      pSizeRow = document.createElement('div');
      pSizeRow.className = 'qtyRow'; 
      pSizeRow.id = 'pSizeRow';
      pSizeRow.style.display = 'none'; // Hidden by default
      pSizeRow.innerHTML = `
        <span class="muted" style="font-size:12px; font-weight:700; width:50px;">SIZE:</span>
        <select id="pSizeSelect" class="qtyInput" style="width:100%; text-align:left; font-size:12px; padding-left:10px; grid-column:span 3;">
            <option value="Size 7">Size 7</option>
            <option value="Size 7 1/8">Size 7 1/8</option>
            <option value="Size 7 1/4">Size 7 1/4</option>
        </select>
      `;
      // Insert size row before Qty row
      const infoDiv = $('.pview__info');
      const qtyRow = $('.qtyRow');
      infoDiv.insertBefore(pSizeRow, qtyRow);
  }
  const sizeSelect = $('#pSizeSelect');

  let currentP = null;

  function openProduct(p) {
    currentP = p;
    pQty.value = 1;

    // Images
    let imgs = [];
    if (Array.isArray(p.images) && p.images.length > 0) imgs = p.images;
    else if (p.image_url) imgs = [p.image_url];

    pMainImg.src = imgs[0] || '';
    pThumbs.innerHTML = '';
    imgs.forEach(src => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.innerHTML = `<img src="${src}" />`;
      t.addEventListener('click', () => pMainImg.src = src);
      pThumbs.appendChild(t);
    });

    pName.textContent = p.name;
    pPrice.textContent = money(p.price);
    pCategory.textContent = p.category || '-';
    pCode.textContent = p.code || '-';

    // --- SIZING LOGIC (Close Caps Only) ---
    if (p.category === 'Close Caps') {
        pSizeRow.style.display = 'grid'; 
        sizeSelect.value = "Standard"; // Default
    } else {
        pSizeRow.style.display = 'none'; 
    }

    // --- SOLD OUT LOGIC ---
    if (p.sold_out) {
        pAddBtn.textContent = "SOLD OUT";
        pAddBtn.disabled = true;
        pAddBtn.style.opacity = "0.5";
        pAddBtn.style.cursor = "not-allowed";
        pSizeRow.style.display = 'none';
    } else {
        pAddBtn.textContent = "ADD TO CART";
        pAddBtn.disabled = false;
        pAddBtn.style.opacity = "1";
        pAddBtn.style.cursor = "pointer";
    }

    pModal.classList.add('is-open');
  }

  $$('[data-close]').forEach(el => {
    el.addEventListener('click', () => pModal.classList.remove('is-open'));
  });

  pMinus.addEventListener('click', () => {
    let v = parseInt(pQty.value) || 1;
    if(v > 1) pQty.value = v - 1;
  });
  pPlus.addEventListener('click', () => {
    let v = parseInt(pQty.value) || 1;
    pQty.value = v + 1;
  });

  pAddBtn.addEventListener('click', () => {
    if(!currentP) return;
    const qty = parseInt(pQty.value) || 1;
    let selectedSize = null;
    if (pSizeRow.style.display !== 'none') selectedSize = sizeSelect.value;

    addToCart(currentP, qty, selectedSize);
    pModal.classList.remove('is-open');
    toggleCart(true); 
  });

  // --- Cart Logic (Updated for Sizes) ---
  const cartItemsDiv = $('#cartItems');
  const cartCount = $('#cartCount');
  const cartSubtotal = $('#cartSubtotal');
  const cartTotalQty = $('#cartTotalQty');

  function addToCart(p, qty, size) {
    const cartId = size ? `${p.id}-${size}` : `${p.id}`;
    const ex = cart.find(x => x.cartId === cartId);
    if(ex) ex.qty += qty;
    else cart.push({ ...p, qty, size, cartId });
    renderCart();
  }

  function removeFromCart(cartId) {
    cart = cart.filter(x => x.cartId !== cartId);
    renderCart();
  }

  function updateCartQty(cartId, newQ) {
    const item = cart.find(x => x.cartId === cartId);
    if(item) {
      item.qty = Math.max(1, newQ);
      renderCart();
    }
  }

  function renderCart() {
    cartItemsDiv.innerHTML = '';
    let total = 0;
    let count = 0;

    cart.forEach(item => {
      total += (item.price * item.qty);
      count += item.qty;

      let img = item.image_url;
      if(Array.isArray(item.images) && item.images.length > 0) img = item.images[0];

      const row = document.createElement('div');
      row.className = 'cartItem';
      const sizeHtml = item.size ? `<div style="font-size:11px; color:#aaa;">Size: ${item.size}</div>` : '';

      row.innerHTML = `
        <img class="cartItem__img" src="${img||''}" />
        <div>
          <div class="cartItem__name">${item.name}</div>
          <div class="cartItem__meta">${money(item.price)}</div>
          ${sizeHtml}
          <div class="cartItem__row">
            <div class="cartQty">
              <button class="cMinus">−</button>
              <input class="cInp" type="number" value="${item.qty}" />
              <button class="cPlus">+</button>
            </div>
          </div>
        </div>
        <button class="trashBtn">🗑</button>
      `;

      row.querySelector('.trashBtn').addEventListener('click', () => removeFromCart(item.cartId));
      row.querySelector('.cMinus').addEventListener('click', () => updateCartQty(item.cartId, item.qty - 1));
      row.querySelector('.cPlus').addEventListener('click', () => updateCartQty(item.cartId, item.qty + 1));

      const inp = row.querySelector('.cInp');
      inp.addEventListener('change', () => updateCartQty(item.cartId, parseInt(inp.value)||1));

      cartItemsDiv.appendChild(row);
    });

    cartCount.textContent = count;
    cartTotalQty.textContent = count;
    cartSubtotal.textContent = money(total);
  }

  function generateOrderForm() {
    const name = $('#cName').value.trim();
    const phone = $('#cPhone').value.trim();
    const addr = $('#cAddress').value.trim();
    const notes = $('#cNotes').value.trim();

    let lines = [];
    lines.push(`Order Date: ${new Date().toLocaleString()}`);
    lines.push(`Customer: ${name}`);
    lines.push(`Phone: ${phone}`);
    lines.push(`Address: ${addr}`);
    if(notes) lines.push(`Notes: ${notes}`);
    lines.push('-------------------------');

    let total = 0;
    cart.forEach(item => {
      const sum = item.price * item.qty;
      total += sum;

      let line = `• ${item.name} (x${item.qty}) - ${money(sum)}`;
      if (item.size) line += ` [SIZE: ${item.size}]`;

      lines.push(line);
      if(item.code) lines.push(`   Code: ${item.code}`);
    });

    lines.push('-------------------------');
    lines.push(`TOTAL: ${money(total)}`);

    $('#orderText').value = lines.join('\n');
  }
}


/* ===========================
   ADMIN LOGIC (UPDATED + FIXED)
   =========================== */
let stagedImages = [];

async function initAdmin() {
  const sb = getSupabase();
  const wrap = $('.adminWrap');

  // Gate check
  const gate = document.createElement('div');
  gate.className = 'keyGate';
  gate.innerHTML = `
    <div class="keyGate__card">
      <div class="keyGate__title">Admin Access</div>
      <div class="keyGate__text">Enter passkey to manage products.</div>
      <input type="password" class="keyGate__input" id="passKey" placeholder="Passkey..." />
      <button class="btn btn--solid btn--wide" id="gateBtn" type="button">Unlock</button>
      <div class="keyGate__hint">Hint: whou?</div>
    </div>
  `;
  document.body.appendChild(gate);

  const passInp = gate.querySelector('#passKey');
  const gateBtn = gate.querySelector('#gateBtn');

  gateBtn.addEventListener('click', () => {
    if(passInp.value === 'admin123') {
      gate.remove();
      loadAdminProducts();
    } else {
      alert('Wrong passkey');
    }
  });

  // DOM
  const createProductBtn = $('#createProductBtn');
  const aName = $('#aName');
  const aPrice = $('#aPrice');
  const aCode = $('#aCode');
  const aSku = $('#aSku');
  const aCategory = $('#aCategory');
  const aStatus = $('#aStatus');
  const aSoldOut = $('#aSoldOut');
  const aImageUrl = $('#aImageUrl');
  const addUrlBtn = $('#addUrlBtn');
  const aFiles = $('#aFiles'); 
  const uploadFilesBtn = $('#uploadFilesBtn');
  const imgList = $('#imgList');
  const msgDiv = $('#adminMsg');

  const productsContainer = $('#adminProducts');

  function setMsg(txt, isErr=false) {
    msgDiv.textContent = txt;
    msgDiv.style.color = isErr ? '#ff4444' : '#00ff88';
    setTimeout(() => msgDiv.textContent = '', 4000);
  }

  function renderStaged() {
    imgList.innerHTML = '';
    stagedImages.forEach((src, idx) => {
      const d = document.createElement('div');
      d.className = 'imgChip';
      d.innerHTML = `
        <img src="${src}" />
        <div class="imgChip__row">
          <span style="font-size:10px; color:#aaa">Image ${idx+1}</span>
          <button class="imgChip__btn" type="button">✕</button>
        </div>
      `;
      d.querySelector('button').addEventListener('click', () => {
        stagedImages.splice(idx, 1);
        renderStaged();
      });
      imgList.appendChild(d);
    });
  }

  addUrlBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const val = aImageUrl.value.trim();
    if (val) {
      stagedImages.push(val);
      renderStaged();
      aImageUrl.value = '';
    }
  });

  uploadFilesBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const files = aFiles.files;
    if (!files || files.length === 0) return;
    if (!sb) return alert("Supabase not configured");

    setMsg('Uploading...');
    uploadFilesBtn.disabled = true;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop();
      const fileName = `upload_${Date.now()}_${i}.${ext}`;

      const { error } = await sb.storage
        .from('public_image')
        .upload(fileName, file);

      if (error) {
        console.error(error);
        setMsg(`Upload failed: ${file.name}`, true);
      } else {
        const { data: { publicUrl } } = sb.storage
          .from('public_image')
          .getPublicUrl(fileName);

        stagedImages.push(publicUrl);
      }
    }

    renderStaged();
    aFiles.value = '';
    uploadFilesBtn.disabled = false;
    setMsg('Uploads complete.');
  });

  createProductBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if(!sb) return;

    const name = (aName?.value || '').trim();
    const price = Number((aPrice?.value || '').trim());
    const code = (aCode?.value || '').trim();
    const sku = (aSku?.value || '').trim();
    const category = (aCategory?.value || 'Earrings');
    const status = (aStatus?.value || 'active');
    const sold_out = Boolean(aSoldOut?.checked);

    if (!name) return setMsg('Name is required.', true);

    const payload = {
      name,
      price,
      code,
      sku,
      category,
      status,
      sold_out,
      images: stagedImages,
      image_url: stagedImages[0] || null
    };

    createProductBtn.disabled = true;
    setMsg('Creating…');

    const { error } = await sb.from('products').insert(payload);

    if (error) {
      console.error(error);
      setMsg(`Failed: ${error.message}`, true);
    } else {
      setMsg('Created ✅');
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

  // --- Toggle Logic in List ---
  async function loadAdminProducts() {
    if(!sb) return;
    productsContainer.innerHTML = 'Loading...';

    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if(error) {
      console.error(error);
      productsContainer.textContent = 'Error loading.';
      return;
    }

    productsContainer.innerHTML = '';
    data.forEach(p => {
      const div = document.createElement('div');
      div.className = 'adminItem';

      let img = p.image_url;
      if(Array.isArray(p.images) && p.images.length > 0) img = p.images[0];

      const isInactive = p.status === 'inactive';
      const isSoldOut = p.sold_out;

      div.innerHTML = `
        <div class="adminItem__top">
          <div>
            <div class="adminItem__name">${p.name}</div>
            <div class="adminItem__meta">${p.category} • ${money(p.price)}</div>
            <div class="adminItem__meta" style="font-size:11px; margin-top:2px;">
               ${isInactive ? '🔴 INACTIVE (Hidden)' : '🟢 ACTIVE'} 
               ${isSoldOut ? ' • ⚠️ SOLD OUT' : ''}
            </div>
          </div>
          ${img ? `<img src="${img}" style="width:40px;height:40px;object-fit:cover;border:1px solid #333">` : ''}
        </div>

        <div class="adminItem__btns" style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn--ghost toggleStatusBtn" style="padding:8px 12px; font-size:10px;">
            ${isInactive ? 'SHOW (Set Active)' : 'HIDE (Set Inactive)'}
          </button>

          <button type="button" class="btn btn--ghost toggleSoldBtn" style="padding:8px 12px; font-size:10px;">
            ${isSoldOut ? 'Mark Available' : 'Mark Sold Out'}
          </button>

          <button type="button" class="btn btn--ghost delBtn" style="padding:8px 12px; font-size:10px; border-color:#552222; color:#faa;">DELETE</button>
        </div>
      `;

      // DELETE
      div.querySelector('.delBtn').addEventListener('click', async () => {
        if(confirm(`Delete "${p.name}"? This cannot be undone.`)) {
          const { error: delErr } = await sb.from('products').delete().eq('id', p.id);
          if (delErr) {
            console.error(delErr);
            alert('Delete failed: ' + delErr.message);
            return;
          }
          loadAdminProducts();
        }
      });

      // TOGGLE STATUS (Hide/Show)
      div.querySelector('.toggleStatusBtn').addEventListener('click', async () => {
        const newStatus = isInactive ? 'active' : 'inactive';
        const { error: updErr } = await sb.from('products').update({ status: newStatus }).eq('id', p.id);
        if (updErr) {
          console.error(updErr);
          alert('Failed to update status: ' + updErr.message);
          return;
        }
        loadAdminProducts();
      });

      // TOGGLE SOLD OUT
      div.querySelector('.toggleSoldBtn').addEventListener('click', async () => {
        const { error: soldErr } = await sb.from('products').update({ sold_out: !isSoldOut }).eq('id', p.id);
        if (soldErr) {
          console.error(soldErr);
          alert('Failed to update sold out: ' + soldErr.message);
          return;
        }
        loadAdminProducts();
      });

      productsContainer.appendChild(div);
    });
  }
}

