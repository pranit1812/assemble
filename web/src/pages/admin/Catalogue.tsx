import { useState, type FormEvent } from 'react';
import { TAGS, type Tag } from '@shared/tags';
import { api, type Product } from './Admin';

const field = 'mt-2 w-full rounded-xl border border-line bg-card px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';
const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export default function Catalogue({ merchantId, searchable, products, onAdd }: { merchantId: string; searchable: boolean; products: Product[]; onAdd: (product: Product) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [kind, setKind] = useState('part');
  const [stock, setStock] = useState('10');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (!/^\d+(\.\d{1,2})?$/.test(price)) { setError('Enter a price in pounds, with up to two decimal places.'); return; }
    if (!tags.length) { setError('Choose at least one tag so shoppers can find this product.'); return; }
    setSaving(true);
    try {
      const product = await api<Product>('/products', { method: 'POST', body: JSON.stringify({ merchantId, title, description, pricePence: Math.round((Number(price) + Number.EPSILON) * 100), tags, kind, stock: Number(stock) }) });
      onAdd(product);
      setNotice(`${product.title} added to your catalogue.`);
      setTitle(''); setDescription(''); setPrice(''); setStock('10'); setTags([]); setTagQuery(''); setOpen(false);
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  const visibleTags = TAGS.filter(tag => tag.replaceAll('-', ' ').includes(tagQuery.toLowerCase().trim().replaceAll('-', ' ')));
  return <section aria-labelledby="catalogue-heading" className="min-w-0 rounded-2xl border border-line bg-card p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 id="catalogue-heading" className="font-display text-3xl">Your catalogue</h2><p className="mt-1.5 text-xs text-muted">{products.length} {products.length === 1 ? 'piece' : 'pieces'} for someone’s next idea</p></div><button type="button" aria-expanded={open} aria-controls="add-product-form" onClick={() => { setOpen(!open); setError(''); }} disabled={saving} className="rounded-xl bg-ink px-4 py-3 text-xs font-medium text-card transition hover:bg-accent disabled:opacity-50">{open ? 'Cancel' : '+ Add product'}</button></div>
    {notice && <p role="status" className="mt-5 rounded-xl bg-own/10 p-3 text-sm text-own">{notice}</p>}
    {!searchable && <p className="mt-4 text-xs leading-5 text-muted">Turn on “Welcome walk-ins” to make stocked products live in local search.</p>}
    {open && <form id="add-product-form" onSubmit={submit} className="mt-6 rounded-xl border border-line bg-paper p-4 sm:p-5">
      <h3 className="font-display text-2xl">Add something useful.</h3><p className="mt-1 text-xs leading-5 text-muted">A finished piece, a small part, or the material to make it.</p>
      <fieldset disabled={saving} className="mt-5 space-y-4 disabled:opacity-60">
        <label className="block text-xs font-medium" htmlFor="product-title">Product title<input id="product-title" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className={field} placeholder="e.g. Red satin cape" /></label>
        <div className="grid grid-cols-2 gap-4"><label className="block text-xs font-medium" htmlFor="product-price">Price (£)<input id="product-price" type="number" inputMode="decimal" min="0" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} className={field} placeholder="18.50" /></label><label className="block text-xs font-medium" htmlFor="product-stock">Stock<input id="product-stock" type="number" inputMode="numeric" min="0" max="1000000" step="1" required value={stock} onChange={event => setStock(event.target.value)} className={field} /></label></div>
        <label className="block text-xs font-medium" htmlFor="product-kind">Kind<select id="product-kind" value={kind} onChange={event => setKind(event.target.value)} className={field}><option value="complete">Complete item</option><option value="part">Part</option><option value="material">Material</option></select></label>
        <label className="block text-xs font-medium" htmlFor="product-description">Description <span className="font-normal text-muted">(optional)</span><textarea id="product-description" maxLength={2000} rows={2} value={description} onChange={event => setDescription(event.target.value)} className={`${field} resize-y`} placeholder="What makes this piece useful?" /></label>
        <div><label htmlFor="tag-search" className="text-xs font-medium">Tags <span className="font-normal text-muted">· choose at least one</span></label><input id="tag-search" value={tagQuery} onChange={event => setTagQuery(event.target.value)} className={field} placeholder="Find a tag: cape, red, fabric…" />
          <p className="mt-2 text-xs leading-5 text-muted" aria-live="polite">{tags.length ? `Selected: ${tags.join(', ')}` : 'Tags connect your product to shopper requests.'}</p>
          <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto p-1" role="group" aria-label="Product tags">{visibleTags.map(tag => <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => setTags(previous => previous.includes(tag) ? previous.filter(item => item !== tag) : [...previous, tag])} className={`rounded-full border px-3 py-2 text-xs transition ${tags.includes(tag) ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-muted hover:border-accent hover:text-ink'}`}>{tag.replaceAll('-', ' ')}{tags.includes(tag) ? ' ✓' : ''}</button>)}{!visibleTags.length && <p className="text-xs text-muted">No matching tags. Try another word.</p>}</div>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-accent">{error}</p>}
      <button disabled={saving} className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-ink disabled:opacity-50">{saving ? 'Adding to your catalogue…' : 'Publish product →'}</button>
    </form>}
    {products.length ? <ul className="mt-5 divide-y divide-line">{products.map(product => <li key={product.id} className="flex items-start gap-4 py-5">
      <span aria-hidden="true" className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-paper font-display text-xl text-muted sm:flex">{product.kind === 'complete' ? '◈' : product.kind === 'material' ? '▧' : '◇'}</span>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium leading-6">{product.title}</p><p className="mt-1 text-xs leading-5 text-muted"><span className="capitalize">{product.kind}</span> · {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</p><div className="mt-2 flex flex-wrap gap-1.5">{product.tags.slice(0, 5).map(tag => <span key={tag} className="rounded-md bg-paper px-2 py-1 text-[10px] text-muted">{tag.replaceAll('-', ' ')}</span>)}{product.tags.length > 5 && <span className="px-1 py-1 text-[10px] text-muted">+{product.tags.length - 5}</span>}</div>{product.stock > 0 && searchable && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-own/10 px-2.5 py-1 text-[10px] font-medium text-own"><span className="h-1 w-1 rounded-full bg-own" />Live in search</span>}</div>
      <p className="shrink-0 pt-1 text-sm tabular-nums">{pounds.format(product.price_pence / 100)}</p>
    </li>)}</ul> : !open && <div className="py-12 text-center"><p className="font-display text-2xl">Your first piece belongs here.</p><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">Add a product and make it available to nearby shoppers.</p></div>}
  </section>;
}
