'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useSearchParams } from 'next/navigation'
import { Check, X, Eye, MapPin, Store } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import Link from 'next/link'

interface Restaurant {
  id: string
  name: string
  branch: string
  address: string
  status?: string
  isOpen: boolean
  coverImageUrl?: string
  deliveryTime: string
  minOrder: string
  createdAt: { toDate?: () => Date } | null
}

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [filter, setFilter] = useState<string>('all')
  const searchParams = useSearchParams()

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f) setFilter(f)
  }, [searchParams])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'restaurants'), snap => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Restaurant)))
    })
    return unsub
  }, [])

  async function updateStatus(id: string, status: string) {
    await updateDoc(doc(db, 'restaurants', id), {
      status,
      updatedAt: serverTimestamp(),
    })
  }

  const withStatus = restaurants.map(r => ({ ...r, status: r.status ?? 'active' }))

  const filtered = filter === 'all'
    ? withStatus
    : withStatus.filter(r => r.status === filter)

  const counts = {
    all: withStatus.length,
    pending: withStatus.filter(r => r.status === 'pending').length,
    active: withStatus.filter(r => r.status === 'active').length,
    suspended: withStatus.filter(r => r.status === 'suspended').length,
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Restaurants</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage restaurant applications and accounts</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-xl w-fit">
        {(['all', 'pending', 'active', 'suspended'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {f} {counts[f] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${f === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-zinc-200 text-zinc-600'}`}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-400 text-sm">
            No {filter === 'all' ? '' : filter} restaurants
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Restaurant</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Address</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Open</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map(restaurant => (
                <tr key={restaurant.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1A0A00] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {restaurant.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={restaurant.coverImageUrl} alt={restaurant.name} className="w-full h-full object-cover" />
                        ) : (
                          <Store size={16} className="text-[#C8880A]" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{restaurant.name}</p>
                        <p className="text-xs text-zinc-400">{restaurant.branch}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-1.5">
                      <MapPin size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-zinc-600 max-w-[220px] truncate">{restaurant.address}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={restaurant.isOpen ? 'open' : 'closed'} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={restaurant.status ?? 'active'} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/restaurants/${restaurant.id}`}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                        title="View details"
                      >
                        <Eye size={15} />
                      </Link>
                      {restaurant.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateStatus(restaurant.id, 'active')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-xs font-semibold"
                          >
                            <Check size={13} /> Approve
                          </button>
                          <button
                            onClick={() => updateStatus(restaurant.id, 'suspended')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-semibold"
                          >
                            <X size={13} /> Reject
                          </button>
                        </>
                      )}
                      {restaurant.status === 'active' && (
                        <button
                          onClick={() => updateStatus(restaurant.id, 'suspended')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-semibold"
                        >
                          <X size={13} /> Suspend
                        </button>
                      )}
                      {restaurant.status === 'suspended' && (
                        <button
                          onClick={() => updateStatus(restaurant.id, 'active')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-xs font-semibold"
                        >
                          <Check size={13} /> Reinstate
                        </button>
                      )}
                    </div>
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
