const variants: Record<string, string> = {
  // generic lifecycle states (restaurants, drivers)
  active:    'bg-green-100 text-green-700',
  approved:  'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  incomplete: 'bg-zinc-100 text-zinc-500',
  suspended: 'bg-red-100 text-red-700',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',

  // order statuses
  placed:           'bg-blue-100 text-blue-700',
  confirmed:        'bg-orange-100 text-orange-700',
  preparing:        'bg-orange-100 text-orange-700',
  driver_assigned:  'bg-purple-100 text-purple-700',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  delivered:        'bg-zinc-100 text-zinc-500',

  // user roles
  customer:         'bg-blue-100 text-blue-700',
  restaurant_owner: 'bg-purple-100 text-purple-700',
  driver:           'bg-orange-100 text-orange-700',

  // open/closed
  open:      'bg-green-100 text-green-700',
  closed:    'bg-zinc-100 text-zinc-500',

  // menu item availability
  available:   'bg-green-100 text-green-700',
  unavailable: 'bg-zinc-100 text-zinc-500',
}

export default function StatusBadge({ status }: { status: string }) {
  const cls = variants[status?.toLowerCase()] ?? 'bg-zinc-100 text-zinc-500'
  const label = status?.replace(/_/g, ' ') ?? status
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {label}
    </span>
  )
}
