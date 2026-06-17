'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  collection, onSnapshot, query, where, doc, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import {
  X, Store, MapPin, Clock, Package, Tag, Star, ArrowRight,
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, UtensilsCrossed,
} from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const CATEGORIES = [
  'Light Meals',
  'Main Meals',
  'Grills',
  'Combos',
  'Platters',
  'Beverages',
  'Extras',
  'Cuts Per Gram',
]

interface Restaurant {
  id: string
  name: string
  branch: string
  address: string
  tags: string
  deliveryTime: string
  minOrder: string
  isOpen: boolean
  status: string
  rating?: number
  reviews?: number
  coverImageUrl?: string
  lat: number
  lng: number
}

interface MenuItemVariant {
  label: string
  price: number
}

interface MenuItem {
  id: string
  restaurantId: string
  name: string
  description: string
  category: string
  price: number
  isAvailable: boolean
  imageUrl?: string | null
  variants: MenuItemVariant[]
}

type EditingItem = Omit<MenuItem, 'id'> & { id?: string }

function blankItem(restaurantId: string): EditingItem {
  return {
    restaurantId,
    name: '',
    description: '',
    category: CATEGORIES[0],
    price: 0,
    isAvailable: true,
    imageUrl: '',
    variants: [],
  }
}

export default function RestaurantPanel({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant
  onClose: () => void
}) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'menuItems'), where('restaurantId', '==', restaurant.id)),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)))
    )
    return unsub
  }, [restaurant.id])

  async function save() {
    if (!editing) return
    setSaving(true)
    const { id, ...data } = editing
    const payload = { ...data, imageUrl: data.imageUrl?.trim() || null }
    if (id) {
      await updateDoc(doc(db, 'menuItems', id), { ...payload, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'menuItems'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    }
    setSaving(false)
    setEditing(null)
  }

  async function toggleAvailability(item: MenuItem) {
    await updateDoc(doc(db, 'menuItems', item.id), {
      isAvailable: !item.isAvailable,
      updatedAt: serverTimestamp(),
    })
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this menu item?')) return
    await deleteDoc(doc(db, 'menuItems', id))
  }

  function updateVariant(i: number, field: keyof MenuItemVariant, value: string) {
    if (!editing) return
    const variants = editing.variants.map((v, idx) =>
      idx === i ? { ...v, [field]: field === 'price' ? Number(value) : value } : v
    )
    setEditing({ ...editing, variants })
  }

  function addVariant() {
    if (!editing) return
    setEditing({ ...editing, variants: [...editing.variants, { label: '', price: 0 }] })
  }

  function removeVariant(i: number) {
    if (!editing) return
    setEditing({ ...editing, variants: editing.variants.filter((_, idx) => idx !== i) })
  }

  async function handleImageUpload(file: File) {
    if (!editing) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `menu-items/${restaurant.id}/${Date.now()}.${ext}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, file, { contentType: file.type })
      const url = await getDownloadURL(fileRef)
      setEditing(prev => prev ? { ...prev, imageUrl: url } : prev)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-[420px] bg-white shadow-2xl flex flex-col z-10 border-l border-zinc-200">
      {/* Header */}
      <div className="px-5 py-4 bg-[#1A0A00] text-[#FAF0DC] flex items-start justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2A1508] flex items-center justify-center overflow-hidden flex-shrink-0">
            {restaurant.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.coverImageUrl} alt={restaurant.name} className="w-full h-full object-cover" />
            ) : (
              <Store size={18} className="text-[#C8880A]" />
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#B09060] uppercase tracking-widest mb-0.5">Restaurant</p>
            <h2 className="font-bold text-base leading-tight">{restaurant.name}</h2>
            <p className="text-xs text-[#B09060]">{restaurant.branch}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-[#B09060] hover:text-white transition-colors mt-0.5">
          <X size={18} />
        </button>
      </div>

      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 flex-shrink-0">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="menu">Menu Items ({items.length})</TabsTrigger>
        </TabsList>

        {/* Info tab */}
        <TabsContent value="info" className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <StatusBadge status={restaurant.status} />
            <StatusBadge status={restaurant.isOpen ? 'open' : 'closed'} />
          </div>
          <Stat icon={<MapPin size={15} className="text-white" />} iconBg="bg-[#3D1E0C]" label="Address" value={restaurant.address || '—'} />
          <Stat icon={<Clock size={15} className="text-white" />} iconBg="bg-[#3D1E0C]" label="Delivery time" value={restaurant.deliveryTime || '—'} />
          <Stat icon={<Package size={15} className="text-white" />} iconBg="bg-[#3D1E0C]" label="Min order" value={restaurant.minOrder || '—'} />
          <Stat icon={<Tag size={15} className="text-white" />} iconBg="bg-[#3D1E0C]" label="Tags" value={restaurant.tags || '—'} />
          <Stat
            icon={<Star size={15} className="text-[#1A0A00]" />}
            iconBg="bg-[#E0A020]"
            label="Rating"
            value={`${(restaurant.rating ?? 5).toFixed(1)} (${restaurant.reviews ?? 0} reviews)`}
          />
        </TabsContent>

        {/* Menu items tab */}
        <TabsContent value="menu" className="flex-1 overflow-y-auto p-4 space-y-2">
          <button
            onClick={() => setEditing(blankItem(restaurant.id))}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-dashed border-zinc-300 text-zinc-500 hover:border-[#C8880A] hover:text-[#C8880A] text-sm font-medium transition-colors mb-2"
          >
            <Plus size={15} /> Add menu item
          </button>

          {items.length === 0 && (
            <div className="py-10 text-center text-zinc-400 text-sm">No menu items yet</div>
          )}

          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-2.5 bg-zinc-50 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-[#1A0A00] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <UtensilsCrossed size={14} className="text-[#C8880A]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">{item.name}</p>
                <p className="text-xs text-zinc-400">{item.category} · R{item.price?.toFixed(2)}</p>
              </div>
              <button onClick={() => toggleAvailability(item)} className="text-zinc-400 hover:text-zinc-700 transition-colors flex-shrink-0" title={item.isAvailable ? 'Available' : 'Unavailable'}>
                {item.isAvailable
                  ? <ToggleRight size={22} className="text-green-500" />
                  : <ToggleLeft size={22} />}
              </button>
              <button onClick={() => setEditing(item)} className="text-zinc-400 hover:text-zinc-700 transition-colors flex-shrink-0">
                <Pencil size={14} />
              </button>
              <button onClick={() => deleteItem(item.id)} className="text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-100 flex-shrink-0">
        <Link
          href={`/restaurants/${restaurant.id}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#1A0A00] text-[#C8880A] hover:bg-[#2A1508] text-sm font-semibold transition-colors"
        >
          View full details <ArrowRight size={14} />
        </Link>
      </div>

      {/* Add / edit menu item dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-white text-zinc-900 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogTitle className="text-lg font-bold">{editing?.id ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
          {editing && (
            <div className="space-y-4 mt-2">
              <Field label="Name *">
                <input className={input} value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <textarea className={`${input} resize-none`} rows={2} value={editing.description}
                  onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category">
                  <select className={input} value={editing.category}
                    onChange={e => setEditing({ ...editing, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Price (R) *">
                  <input type="number" min={0} step="0.01" className={input} value={editing.price}
                    onChange={e => setEditing({ ...editing, price: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="Photo">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {editing.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editing.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UtensilsCrossed size={20} className="text-zinc-300" />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleImageUpload(file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-3 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {uploading ? 'Uploading…' : editing.imageUrl ? 'Replace photo' : 'Upload photo'}
                    </button>
                    {editing.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, imageUrl: '' })}
                        className="text-sm text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </Field>

              {/* Variants */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                  Variants (optional)
                </label>
                <div className="space-y-2">
                  {editing.variants.map((v, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={`${input} flex-1`} placeholder="e.g. Large Plate" value={v.label}
                        onChange={e => updateVariant(i, 'label', e.target.value)} />
                      <input type="number" min={0} step="0.01" className={`${input} w-28`} placeholder="Price" value={v.price}
                        onChange={e => updateVariant(i, 'price', e.target.value)} />
                      <button onClick={() => removeVariant(i)} className="px-2 text-zinc-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addVariant} className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-[#C8880A] hover:text-[#E0A020] transition-colors">
                  <Plus size={13} /> Add variant
                </button>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" checked={editing.isAvailable}
                  onChange={e => setEditing({ ...editing, isAvailable: e.target.checked })} />
                <span className="text-sm font-medium text-zinc-700">Available to customers</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                  Cancel
                </button>
                <button onClick={save} disabled={saving || uploading || !editing.name || !editing.category}
                  className="flex-1 py-2.5 rounded-xl bg-[#1A0A00] text-[#C8880A] text-sm font-semibold hover:bg-[#2A1508] disabled:opacity-40 transition-colors">
                  {saving ? 'Saving…' : editing.id ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const input = 'w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Stat({
  icon, iconBg, label, value,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-semibold text-zinc-900 truncate">{value}</p>
      </div>
    </div>
  )
}
