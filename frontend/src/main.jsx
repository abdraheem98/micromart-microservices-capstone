import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const detail = data?.detail || data?.message || `Request failed (${response.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

function App() {
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState({});
  const [orders, setOrders] = useState([]);
  const [productId, setProductId] = useState("1");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastOrder, setLastOrder] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, o] = await Promise.all([
        request("/products/"),
        request("/orders/orders"),
      ]);
      setProducts(p);
      setOrders(Array.isArray(o) ? [...o].reverse() : []);
      const stockEntries = await Promise.all(
        p.map(async (item) => {
          try { return [item.id, await request(`/inventory/stock/${item.id}`)]; }
          catch { return [item.id, null]; }
        })
      );
      setStock(Object.fromEntries(stockEntries));
    } catch (e) {
      setError(`${e.message}. Check that the Kubernetes gateway and backend services are running.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function placeOrder(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setLastOrder(null);
    try {
      const order = await request("/orders/orders", {
        method: "POST",
        body: JSON.stringify({ product_id: Number(productId), quantity: Number(quantity) }),
      });
      setLastOrder(order);
      setNotice(`Order #${order.order_id} confirmed successfully.`);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedProduct = products.find((p) => p.id === Number(productId));
  const selectedStock = stock[Number(productId)]?.available;
  const money = (n) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  }).format(n);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">M</div><div><strong>MicroMart</strong><span>MICROSERVICES LAB</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item active" href="#overview"><span>▦</span> Overview</a>
        <a className="nav-item" href="#products"><span>◇</span> Products & stock</a>
        <a className="nav-item" href="#orders"><span>↗</span> Orders</a>
        <div className="sidebar-bottom"><span className="pulse"></span><div><strong>Capstone environment</strong><small>Amazon EKS · Kubernetes</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="crumb">Workspace <span>/</span> Overview</div><div className="top-right"><span className="live-dot"></span> Demo environment <div className="avatar">MM</div></div></header>
        <section className="welcome" id="overview">
          <div><div className="eyebrow">MICROMART OPERATIONS</div><h1>Inventory overview</h1><p>Manage products, check availability, and place orders across your microservices.</p></div>
          <button className="secondary-button" onClick={refresh} disabled={loading}>↻ &nbsp; Refresh data</button>
        </section>

        <section className="metrics">
          <article className="metric-card"><div className="metric-top"><span>PRODUCTS</span><span className="metric-icon purple">◇</span></div><strong>{loading ? "—" : products.length}</strong><small>Available in catalogue</small></article>
          <article className="metric-card"><div className="metric-top"><span>UNITS IN STOCK</span><span className="metric-icon green">▤</span></div><strong>{loading ? "—" : Object.values(stock).reduce((sum, s) => sum + (s?.available || 0), 0)}</strong><small>Across listed products</small></article>
          <article className="metric-card"><div className="metric-top"><span>ORDERS CREATED</span><span className="metric-icon blue">↗</span></div><strong>{loading ? "—" : orders.length}</strong><small>In this demo session</small></article>
          <article className="metric-card"><div className="metric-top"><span>SERVICES</span><span className="metric-icon orange">⌘</span></div><strong>3</strong><small>Product · Inventory · Orders</small></article>
        </section>

        {error && <div className="alert error"><strong>Something needs attention</strong><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="alert success"><strong>{notice}</strong><span>{lastOrder ? `Product ${lastOrder.product_id} · Quantity ${lastOrder.quantity} · Status ${lastOrder.status}` : ""}</span><button onClick={() => setNotice("")}>×</button></div>}

        <section className="content-grid">
          <article className="panel products-panel" id="products">
            <div className="panel-heading"><div><h2>Product catalogue</h2><p>Live response from the Product Service</p></div><span className="service-tag"><i></i> PRODUCT API</span></div>
            <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>PRICE</th><th>AVAILABLE</th></tr></thead>
              <tbody>{products.map((p) => <tr key={p.id}><td><div className="product-cell"><div className={`product-icon p${p.id}`}>{p.id === 1 ? "⌨" : p.id === 2 ? "◉" : "▣"}</div><strong>{p.name}</strong></div></td><td className="muted">MM-{String(p.id).padStart(3, "0")}</td><td>{money(p.price)}</td><td>{stock[p.id] ? <span className={`stock ${stock[p.id].available > 0 ? "in-stock" : "out-stock"}`}>{stock[p.id].available} units</span> : <span className="muted">Unavailable</span>}</td></tr>)}
              {!loading && products.length === 0 && <tr><td colSpan="4" className="empty">No products returned by the service.</td></tr>}
              {loading && <tr><td colSpan="4" className="empty">Loading service data…</td></tr>}
            </tbody></table></div>
            <div className="panel-foot">Data supplied by independent Product and Inventory APIs.</div>
          </article>

          <article className="panel order-panel">
            <div className="panel-heading"><div><h2>Create an order</h2><p>Orders call Inventory over HTTP</p></div><span className="order-symbol">＋</span></div>
            <form onSubmit={placeOrder}>
              <label htmlFor="product">Product</label>
              <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={busy || products.length === 0}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
              </select>
              <div className="stock-hint">{selectedStock == null ? "Stock status unavailable" : `${selectedStock} units available`}</div>
              <label htmlFor="quantity">Quantity</label>
              <div className="quantity-control"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={busy || quantity <= 1}>−</button><input id="quantity" type="number" min="1" max="100" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} disabled={busy}/><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => Math.min(100, q + 1))} disabled={busy || quantity >= 100}>＋</button></div>
              <div className="order-total"><span>Estimated total</span><strong>{money((selectedProduct?.price || 0) * quantity)}</strong></div>
              <button className="primary-button" type="submit" disabled={busy || loading || !products.length}>{busy ? "Processing order…" : "Place order"} <span>→</span></button>
              <p className="form-note">Insufficient stock is rejected by the Inventory Service.</p>
            </form>
          </article>
        </section>

        <section className="panel orders-panel" id="orders">
          <div className="panel-heading"><div><h2>Recent orders</h2><p>Orders recorded by the Order Service</p></div><span className="count-pill">{orders.length} total</span></div>
          <div className="table-wrap"><table><thead><tr><th>ORDER ID</th><th>PRODUCT ID</th><th>QUANTITY</th><th>STATUS</th></tr></thead><tbody>
            {orders.slice(0, 6).map((o) => <tr key={o.order_id}><td className="order-id">#{o.order_id}</td><td>MM-{String(o.product_id).padStart(3, "0")}</td><td>{o.quantity}</td><td><span className="status-confirmed"><i></i>{o.status}</span></td></tr>)}
            {!loading && orders.length === 0 && <tr><td colSpan="4" className="empty">No orders yet. Place an order to see it here.</td></tr>}
            {loading && <tr><td colSpan="4" className="empty">Loading orders…</td></tr>}
          </tbody></table></div>
        </section>
        <footer><span>MicroMart Capstone</span><span>React UI · FastAPI · Kubernetes</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
