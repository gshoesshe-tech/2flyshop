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


// --- PAGE LOGIC ---

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;

  // 1) LANDING PAGE
  if (page === 'landing') {
    const btn = $('#enterBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        // Simple fade out
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

  // 2) SHOP PAGE
  if (page === 'shop') {
    initShop();
  }

  // 3) ADMIN PAGE
  if (page === 'admin') {
    initAdmin();
  }
});


/* ===========================
   SHOP LOGIC
   =========================== */
let allProducts = [];
let cart = [];
let activeFilter = "Earrings"; // Default

async function initShop() {
  const sb = getSupabase();
  const grid = $('#productsGrid');
  const empty = $('#emptyState');

  // --- Products Dropdown Logic (NEW) ---
  const productsNav = $('.productsNav');
  const productsToggle = $('#productsToggle');
  const productsDropdown = $('.productsDropdown');
  const pills = $$('.pill', productsDropdown);

  if (productsToggle) {
    productsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        productsNav.classList.toggle('open');
        productsToggle.setAttribute('aria-expanded', productsNav.classList.contains('open'));
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!productsNav.contains(e.target)) {
            productsNav.classList.remove('open');
            productsToggle.setAttribute('aria-expanded', 'false');
        }
    });

    // Pill click
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            // Update active state
            pills.forEach(p => p.classList.remove('is-active'));
            pill.classList.add('is-active');
            
            // Set filter
            activeFilter = pill.dataset.filter;
            
            // Close dropdown
            productsNav.classList.remove('open');
            productsToggle.setAttribute('aria-expanded', 'false');

            // Render
            renderGrid(allProducts);
        });
    });
  }

  // Help Modal
  const helpBtn = $('#helpBtn');
  const helpModal = $('#helpModal');
  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => helpModal.classList.add('is-open'));
    
    // Close handlers
    $$('[data-help-close]').forEach(el => {
      el.addEventListener('click', () => helpModal.classList.remove('is-open'));
    });
  }

  // Cart Drawer
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

  // Checkout Modal
  const checkoutBtn = $('#checkoutBtn');
  const checkoutModal = $('#checkoutModal');
  const copyOrderBtn = $('#copyOrderBtn');
  
  checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) return alert("Cart is empty!");
    toggleCart(false);
    checkoutModal.classList.add('is-open');
    generateOrderForm();
  });
  
  // Close checkout
  $$('[data-close-checkout]').forEach(el => {
    el.addEventListener('click', () => checkoutModal.classList.remove('is-open'));
  });

  // Inputs in checkout -> update order text
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

  // Fetch
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
    
    // Filter
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
      // images array support (backward compat with single image_url)
      let img = p.image_url;
      if (Array.isArray(p.images) && p.images.length > 0) {
        img = p.images[0];
      }

      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
        <img class="card__img" src="${img || ''}" loading="lazy" />
        <div class="card__body">
          <div class="card__name">${p.name}</div>
          <div class="card__price">${money(p.price)}</div>
        </div>
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
  const pSku = $('#pSku');
  const pCode = $('#pCode');
  const pQty = $('#pQty');
  const pMinus = $('#pMinus');
  const pPlus = $('#pPlus');
  const pAddBtn = $('#pAddBtn');
  let currentP = null;

  function openProduct(p) {
    currentP = p;
    pQty.value = 1;

    // Images
    let imgs = [];
    if (Array.isArray(p.images) && p.images.length > 0) imgs = p.images;
    else if (p.image_url) imgs = [p.image_url];

    // Set main
    pMainImg.src = imgs[0] || '';
    
    // Thumbs
    pThumbs.innerHTML = '';
    imgs.forEach(src => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.innerHTML = `<img src="${src}" />`;
      t.addEventListener('click', () => {
        pMainImg.src = src;
      });
      pThumbs.appendChild(t);
    });

    pName.textContent = p.name;
    pPrice.textContent = money(p.price);
    pCategory.textContent = p.category || '-';
    pSku.textContent = p.sku || '-';
    pCode.textContent = p.code || '-';

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
    addToCart(currentP, qty);
    pModal.classList.remove('is-open');
    toggleCart(true); // Open cart to show it
  });

  // --- Cart Logic ---
  const cartItemsDiv = $('#cartItems');
  const cartCount = $('#cartCount');
  const cartSubtotal = $('#cartSubtotal');
  const cartTotalQty = $('#cartTotalQty');

  function addToCart(p, qty) {
    const ex = cart.find(x => x.id === p.id);
    if(ex) {
      ex.qty += qty;
    } else {
      cart.push({ ...p, qty });
    }
    renderCart();
  }

  function removeFromCart(id) {
    cart = cart.filter(x => x.id !== id);
    renderCart();
  }

  function updateCartQty(id, newQ) {
    const item = cart.find(x => x.id === id);
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
      row.innerHTML = `
        <img class="cartItem__img" src="${img||''}" />
        <div>
          <div class="cartItem__name">${item.name}</div>
          <div class="cartItem__meta">${money(item.price)}</div>
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

      // Events
      row.querySelector('.trashBtn').addEventListener('click', () => removeFromCart(item.id));
      row.querySelector('.cMinus').addEventListener('click', () => updateCartQty(item.id, item.qty - 1));
      row.querySelector('.cPlus').addEventListener('click', () => updateCartQty(item.id, item.qty + 1));
      
      const inp = row.querySelector('.cInp');
      inp.addEventListener('change', () => updateCartQty(item.id, parseInt(inp.value)||1));

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
      lines.push(`• ${item.name} (x${item.qty}) - ${money(sum)}`);
      // Include code/sku if needed
      if(item.code) lines.push(`   Code: ${item.code}`);
    });
    
    lines.push('-------------------------');
    lines.push(`TOTAL: ${money(total)}`);

    $('#orderText').value = lines.join('\n');
  }
}


/* ===========================
   ADMIN LOGIC
   =========================== */
let stagedImages = []; // Strings (URLs)

async function initAdmin() {
  const sb = getSupabase();
  const wrap = $('.adminWrap');
  
  // Gate check (Simple password)
  const gate = document.createElement('div');
  gate.className = 'keyGate';
  gate.innerHTML = `
    <div class="keyGate__card">
      <div class="keyGate__title">Admin Access</div>
      <div class="keyGate__text">Enter passkey to manage products.</div>
      <input type="password" class="keyGate__input" id="passKey" placeholder="Passkey..." />
      <button class="btn btn--solid btn--wide" id="gateBtn">Unlock</button>
      <div class="keyGate__hint">Hint: admin123</div>
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
  
  // Image handling
  const aImageUrl = $('#aImageUrl'); // URL input
  const addUrlBtn = $('#addUrlBtn');
  const aFiles = $('#aFiles');       // File input
  const uploadFilesBtn = $('#uploadFilesBtn');
  const imgList = $('#imgList');

  const msgDiv = $('#adminMsg');
  const productsList = $('#adminProductsList');

  function setMsg(txt, isErr=false) {
    msgDiv.textContent = txt;
    msgDiv.style.color = isErr ? '#ff4444' : '#00ff88';
    setTimeout(() => msgDiv.textContent = '', 4000);
  }

  // --- Image staging ---
  function renderStaged() {
    imgList.innerHTML = '';
    stagedImages.forEach((src, idx) => {
      const d = document.createElement('div');
      d.className = 'imgChip';
      d.innerHTML = `
        <img src="${src}" />
        <div class="imgChip__row">
          <span style="font-size:10px; color:#aaa">Image ${idx+1}</span>
          <button class="imgChip__btn">✕</button>
        </div>
      `;
      d.querySelector('button').addEventListener('click', () => {
        stagedImages.splice(idx, 1);
        renderStaged();
      });
      imgList.appendChild(d);
    });
  }

  // Add URL manually
  addUrlBtn.addEventListener('click', () => {
    const val = aImageUrl.value.trim();
    if (val) {
      stagedImages.push(val);
      renderStaged();
      aImageUrl.value = '';
    }
  });

  // Upload Files to Supabase Storage
  uploadFilesBtn.addEventListener('click', async () => {
    const files = aFiles.files;
    if (!files || files.length === 0) return;
    if (!sb) return alert("Supabase not configured");

    setMsg('Uploading...');
    uploadFilesBtn.disabled = true;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop();
      const fileName = `upload_${Date.now()}_${i}.${ext}`;
      
      // Upload to "public_image" bucket (ensure it exists and is public)
      const { data, error } = await sb.storage
        .from('public_image')
        .upload(fileName, file);

      if (error) {
        console.error(error);
        setMsg(`Upload failed: ${file.name}`, true);
      } else {
        // Get public URL
        const { data: { publicUrl } } = sb.storage
          .from('public_image')
          .getPublicUrl(fileName);
        
        stagedImages.push(publicUrl);
      }
    }
    
    renderStaged();
    aFiles.value = ''; // clear input
    uploadFilesBtn.disabled = false;
    setMsg('Uploads complete.');
  });


  // --- Create Product ---
  createProductBtn.addEventListener('click', async () => {
    if(!sb) return;
    
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

  // --- List & Delete ---
  async function loadAdminProducts() {
    if(!sb) return;
    productsList.innerHTML = 'Loading...';

    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if(error) {
      productsList.textContent = 'Error loading.';
      return;
    }

    productsList.innerHTML = '';
    data.forEach(p => {
      const div = document.createElement('div');
      div.className = 'adminItem';
      
      let img = p.image_url;
      if(Array.isArray(p.images) && p.images.length > 0) img = p.images[0];

      div.innerHTML = `
        <div class="adminItem__top">
          <div>
            <div class="adminItem__name">${p.name}</div>
            <div class="adminItem__meta">${p.category} • ${money(p.price)}</div>
            <div class="adminItem__meta" style="font-size:11px; margin-top:2px;">
               Status: ${p.status} ${p.sold_out ? '(SOLD OUT)' : ''}
            </div>
          </div>
          ${img ? `<img src="${img}" style="width:40px;height:40px;object-fit:cover;border:1px solid #333">` : ''}
        </div>
        <div class="adminItem__btns" style="margin-top:10px;">
          <button class="btn btn--ghost delBtn" style="padding:8px 12px; font-size:10px;">DELETE</button>
        </div>
      `;

      div.querySelector('.delBtn').addEventListener('click', async () => {
        if(confirm(`Delete "${p.name}"?`)) {
          await sb.from('products').delete().eq('id', p.id);
          loadAdminProducts();
        }
      });

      productsList.appendChild(div);
    });
  }
}
