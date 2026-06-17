'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { UtensilsCrossed, ToggleLeft, ToggleRight } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'

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

interface MenuItem {
  id: string
  restaurantId: string
  name: string
  description: string
  category: string
  price: number
  isAvailable: boolean
  imageUrl?: string
}

interface Restaurant {
  id: string
  name: string
  branch: string
}

export default function MenuItemsPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [restaurantFilter, setRestaurantFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    const unsubItems = onSnapshot(collection(db, 'menuItems'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)))
    })
    const unsubRestaurants = onSnapshot(collection(db, 'restaurants'), snap => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Restaurant)))
    })
    return () => { unsubItems(); unsubRestaurants() }
  }, [])

  async function toggleAvailability(id: string, current: boolean) {
    await updateDoc(doc(db, 'menuItems', id), {
      isAvailable: !current,
      updatedAt: serverTimestamp(),
    })
  }

  function restaurantName(id: string) {
    const r = restaurants.find(r => r.id === id)
    return r ? `${r.name} ${r.branch}`.trim() : '—'
  }

  const filtered = items.filter(item =>
    (restaurantFilter === 'all' || item.restaurantId === restaurantFilter) &&
    (categoryFilter === 'all' || item.category === categoryFilter)
  )

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Menu Items</h1>
          <p className="text-zinc-500 text-sm mt-1">{items.length} items across all restaurants</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={restaurantFilter}
            onChange={e => setRestaurantFilter(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-zinc-400"
          >
            <option value="all">All restaurants</option>
            {restaurants.map(r => (
              <option key={r.id} value={r.id}>{r.name} {r.branch}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-zinc-400"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-400 text-sm">No menu items</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Item</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Restaurant</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Price</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1A0A00] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <UtensilsCrossed size={15} className="text-[#C8880A]" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{item.name}</p>
                        <p className="text-xs text-zinc-400 max-w-[220px] truncate">{item.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-600">{restaurantName(item.restaurantId)}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">{item.category}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-zinc-900">R{item.price?.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={item.isAvailable ? 'available' : 'unavailable'} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleAvailability(item.id, item.isAvailable)} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                      {item.isAvailable
                        ? <ToggleRight size={24} className="text-green-500" />
                        : <ToggleLeft size={24} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
