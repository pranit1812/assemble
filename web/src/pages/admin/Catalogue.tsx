import { useState, type FormEvent } from 'react';
import { TAGS, type Tag } from '@shared/tags';
import { api, type Product } from './Admin';

const field = 'mt-2 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40';
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
  return <section aria-labelledby="catalogue-heading" className="mt-20 min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id="catalogue-heading" className="font-display text-3xl text-ink">Your catalogue</h2>
        <p className="mt-2 text-sm text-muted">{products.length} {products.length === 1 ? 'piece' : 'pieces'} for someone’s next idea</p>
      </div>
      <button type="button" aria-expanded={open} aria-controls="add-product-form" onClick={() => { setOpen(!open); setError(''); }} disabled={saving} className={open ? 'text-sm text-muted transition hover:text-ink' : 'rounded-full bg-ink px-4 py-2 text-sm text-paper transition hover:bg-accent disabled:opacity-50'}>{open ? 'Cancel' : 'Add product'}</button>
    </div>
    {notice && <p role="status" className="mt-6 text-sm text-own">{notice}</p>}
    {!searchable && <p className="mt-4 text-sm leading-relaxed text-muted">Turn on “Welcome walk-ins” to make stocked products live in local search.</p>}
    {open && <form id="add-product-form" onSubmit={submit} className="mt-8 max-w-lg">
      <h3 className="font-display text-2xl text-ink">Add something useful.</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">A finished piece, a small part, or the material to make it.</p>
      <fieldset disabled={saving} className="mt-8 space-y-5 disabled:opacity-60">
        <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor="product-title">Product title<input id="product-title" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className={field} placeholder="e.g. Red satin cape" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor="product-price">Price (£)<input id="product-price" type="number" inputMode="decimal" min="0" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} className={field} placeholder="18.50" /></label>
          <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor="product-stock">Stock<input id="product-stock" type="number" inputMode="numeric" min="0" max="1000000" step="1" required value={stock} onChange={event => setStock(event.target.value)} className={field} /></label>
        </div>
        <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor="product-kind">Kind<select id="product-kind" value={kind} onChange={event => setKind(event.target.value)} className={field}><option value="complete">Complete item</option><option value="part">Part</option><option value="material">Material</option></select></label>
        <label className="block text-[12px] font-medium uppercase tracking-[0.12em] text-muted" htmlFor="product-description">Description <span className="font-normal normal-case tracking-normal text-faint">(optional)</span><textarea id="product-description" maxLength={2000} rows={2} value={description} onChange={event => setDescription(event.target.value)} className={`${field} resize-y`} placeholder="What makes this piece useful?" /></label>
        <div>
          <label htmlFor="tag-search" className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Tags <span className="font-normal normal-case tracking-normal text-faint">· choose at least one</span></label>
          <input id="tag-search" value={tagQuery} onChange={event => setTagQuery(event.target.value)} className={field} placeholder="Find a tag: cape, red, fabric…" />
          <p className="mt-3 break-words text-sm leading-relaxed text-muted" aria-live="polite">{tags.length ? `Selected: ${tags.join(', ')}` : 'Tags connect your product to shopper requests.'}</p>
          <div className="mt-4 flex max-h-40 flex-wrap gap-2 overflow-y-auto" role="group" aria-label="Product tags">{visibleTags.map(tag => <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => setTags(previous => previous.includes(tag) ? previous.filter(item => item !== tag) : [...previous, tag])} className={`rounded-full border px-3 py-1.5 text-[13px] transition ${tags.includes(tag) ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-muted hover:text-ink'}`}>{tag.replaceAll('-', ' ')}</button>)}{!visibleTags.length && <p className="text-sm text-muted">No matching tags. Try another word.</p>}</div>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-accent">{error}</p>}
      <button disabled={saving} className="mt-8 w-full rounded-full bg-ink py-3 text-[15px] font-medium text-paper transition hover:bg-accent disabled:opacity-50">{saving ? 'Adding to your catalogue…' : 'Publish product'}</button>
    </form>}
    {products.length ? <ul className="mt-8 divide-y divide-line border-y border-line">{products.map(product => <li key={product.id} className="flex items-start gap-4 py-5">
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] text-ink">{product.title}</p>
        <p className="mt-1 break-words text-sm text-muted"><span className="capitalize">{product.kind}</span> · {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}{product.stock > 0 && searchable ? ' · In search' : ''}</p>
        {product.tags.length > 0 && <p className="mt-1 break-words text-sm text-muted">{product.tags.map(tag => tag.replaceAll('-', ' ')).join(' · ')}</p>}
      </div>
      <p className="shrink-0 font-mono text-sm text-ink">{pounds.format(product.price_pence / 100)}</p>
    </li>)}</ul> : !open && <div className="mt-10">
      <p className="font-display text-2xl text-ink">Your first piece belongs here.</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">Add a product and make it available to nearby shoppers.</p>
    </div>}
  </section>;
}
