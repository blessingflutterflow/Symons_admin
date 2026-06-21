'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Banknote } from 'lucide-react'

interface Payout {
  id: string
  driverName?: string
  amountRands: number
  status: string
  orderId?: string
  bankName?: string
  bankAccountNumber?: string
  createdAt: { toDate?: () => Date } | null
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  success:           { label: 'Paid',      cls: 'bg-green-100 text-green-700' },
  pending:           { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' },
  failed:            { label: 'Failed',    cls: 'bg-red-100 text-red-600' },
  recipient_missing: { label: 'No bank',   cls: 'bg-red-100 text-red-600' },
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'payouts'), orderBy('createdAt', 'desc')),
      snap => setPayouts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payout)))
    )
    return unsub
  }, [])

  function formatTime(p: Payout) {
    if (!p.createdAt?.toDate) return '—'
    return p.createdAt.toDate().toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })
  }

  const filtered = filter === 'all' ? payouts : payouts.filter(p => p.status === filter)
  const totalPaid = payouts
    .filter(p => p.status === 'success')
    .reduce((s, p) => s + (p.amountRands || 0), 0)

  const filters = ['all', 'success', 'pending', 'failed', 'recipient_missing']

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Driver Payouts</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Automatic delivery-fee payouts sent to drivers via Paystack — total paid out: R{totalPaid.toFixed(2)}
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-xl flex-wrap overflow-x-auto">
        {filters.map(f => {
          const count = f === 'all' ? payouts.length : payouts.filter(p => p.status === f).length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {f.replace(/_/g, ' ')} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-400 text-sm">No payouts</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Driver</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Bank</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Order</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filtered.map(p => {
                  const style = STATUS_STYLES[p.status] ?? { label: p.status, cls: 'bg-zinc-100 text-zinc-600' }
                  const acc = p.bankAccountNumber ?? ''
                  const last4 = acc.length > 4 ? acc.slice(-4) : acc
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#1A0A00] flex items-center justify-center flex-shrink-0">
                            <Banknote size={13} className="text-[#C8880A]" />
                          </div>
                          <p className="text-sm font-semibold text-zinc-900">{p.driverName || 'Driver'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-zinc-900">R{(p.amountRands || 0).toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-zinc-600">
                          {p.bankName ? `${p.bankName} •••• ${last4}` : '—'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-zinc-400">
                          {p.orderId ? `#${p.orderId.substring(0, 8).toUpperCase()}` : '—'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${style.cls}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-zinc-400">{formatTime(p)}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
