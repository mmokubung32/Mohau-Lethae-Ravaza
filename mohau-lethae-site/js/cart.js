/*
  Mohau Lethae site — client-side cart prototype.
  Uses localStorage because this is a real static site meant for deployment,
  not a sandboxed chat artifact. No payment or inventory calls happen here —
  see docs/BACKEND-ROADMAP.md Phases 5–9 for where this plugs into a real
  cart/checkout/payment backend. Every unique original is capped at qty 1,
  reflecting inventory = 1 in the data model described in docs/DATABASE.md.
*/

const CART_KEY = "mohau-cart-v1";

function cartRead() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Cart read failed:", e);
    return [];
  }
}

function cartWrite(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Cart write failed:", e);
  }
  cartRenderBadge();
}

function cartAdd(item) {
  const items = cartRead();
  const existing = items.find(i => i.slug === item.slug);
  if (existing) {
    // Unique originals: qty stays at 1 (there is only ever one).
    return { ok: false, reason: "already-in-cart" };
  }
  items.push({ ...item, qty: 1 });
  cartWrite(items);
  return { ok: true };
}

function cartRemove(slug) {
  const items = cartRead().filter(i => i.slug !== slug);
  cartWrite(items);
}

function cartClear() {
  cartWrite([]);
}

function cartCount() {
  return cartRead().reduce((sum, i) => sum + i.qty, 0);
}

function cartSubtotal() {
  return cartRead().reduce((sum, i) => sum + i.price * i.qty, 0);
}

function cartHasFragileItem() {
  return cartRead().some((i) => i.shipsFragile);
}

function cartRenderBadge() {
  const badge = document.getElementById("cartCount");
  if (!badge) return;
  const count = cartCount();
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

// Wire up any "Add to cart" buttons found on the page (work detail pages).
function cartWireAddButtons() {
  document.querySelectorAll("[data-add-to-cart]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = {
        slug: btn.dataset.slug,
        title: btn.dataset.title,
        price: Number(btn.dataset.price),
        medium: btn.dataset.medium,
        image: btn.dataset.image,
        productType: btn.dataset.productType || "artwork",
        shipsFragile: btn.dataset.shipsFragile === "true",
      };
      const result = cartAdd(item);
      const feedback = document.getElementById("addToCartFeedback");
      if (feedback) {
        feedback.textContent = result.ok
          ? "Added to cart."
          : "This piece is already in your cart — it's a one-of-one, so quantity stays at 1.";
        feedback.classList.add("show");
      }
      if (result.ok) {
        btn.textContent = "Added — view cart";
        btn.setAttribute("href", "cart.html");
        btn.removeAttribute("data-add-to-cart");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  cartRenderBadge();
  cartWireAddButtons();
});
