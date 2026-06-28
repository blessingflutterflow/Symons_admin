'use client'

import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Banknote, Check } from 'lucide-react'

interface Payout {
  id: string
  driverName?: string
  amountRands: number
  status: string
  orderId?: string
  bankName?: string
  bankAccountNumber?: string
  bankAccountName?: string
  createdAt: { toDate?: () => Date } | null
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  paid:    { label: 'Paid',    cls: 'bg-green-100 text-green-700' },
  success: { label: 'Paid',    cls: 'bg-green-100 text-green-700' }, // legacy
  pending: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'payouts'), orderBy('createdAt', 'desc')),
      snap => setPayouts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payout)))
    )
    return unsub
  }, [])

  async function markPaid(id: string) {
    if (!confirm('Mark this payout as paid? Do this only after you have actually paid the driver.')) return
    setBusy(id)
    try {
      await updateDoc(doc(db, 'payouts', id), { status: 'paid', paidAt: serverTimestamp() })
    } finally {
      setBusy(null)
    }
  }

  function formatTime(p: Payout) {
    if (!p.createdAt?.toDate) return '—'
    return p.createdAt.toDate().toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })
  }

  const isPaid = (s: string) => s === 'paid' || s === 'success'
  const filtered = filter === 'all'
    ? payouts
    : payouts.filter(p => filter === 'paid' ? isPaid(p.status) : p.status === filter)

  const totalPaid = payouts.filter(p => isPaid(p.status)).reduce((s, p) => s + (p.amountRands || 0), 0)
  const totalPending = payouts.filter(p => !isPaid(p.status)).reduce((s, p) => s + (p.amountRands || 0), 0)

  const filters = ['all', 'pending', 'paid']

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Driver Payouts</h1>
        <p className="text-zinc-500 text-sm mt-1">
          What each driver has earned per delivery. Pay them via your bank (EFT), then mark it paid here.
          Owing: <span className="font-semibold text-yellow-700">R{totalPending.toFixed(2)}</span> · Paid out: <span className="font-semibold text-green-700">R{totalPaid.toFixed(2)}</span>
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-xl flex-wrap overflow-x-auto">
        {filters.map(f => {
          const count = f === 'all'
            ? payouts.length
            : f === 'paid' ? payouts.filter(p => isPaid(p.status)).length : payouts.filter(p => p.status === f).length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {f} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
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
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Driver</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Bank details</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Order</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filtered.map(p => {
                  const style = STATUS_STYLES[p.status] ?? { label: p.status, cls: 'bg-zinc-100 text-zinc-600' }
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
                        {p.bankAccountNumber ? (
                          <div className="text-sm text-zinc-600 leading-tight">
                            <p className="font-medium text-zinc-800">{p.bankName || '—'}</p>
                            <p className="text-xs text-zinc-500">{p.bankAccountNumber}{p.bankAccountName ? ` · ${p.bankAccountName}` : ''}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-red-500">No bank details</p>
                        )}
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
                      <td className="px-6 py-4 text-right">
                        {isPaid(p.status) ? (
                          <span className="text-xs text-zinc-400">✓ Done</span>
                        ) : (
                          <button
                            onClick={() => markPaid(p.id)}
                            disabled={busy === p.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A0A00] text-[#C8880A] text-xs font-semibold hover:bg-[#2A1508] disabled:opacity-50 transition-colors"
                          >
                            <Check size={13} />
                            {busy === p.id ? 'Saving…' : 'Mark paid'}
                          </button>
                        )}
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
