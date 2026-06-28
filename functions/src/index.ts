import * as admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

admin.initializeApp()
const db = admin.firestore()

// ─── FCM helpers ──────────────────────────────────────────────────────────────

/** Send to a customer — reads fcmToken from users/{userId}.
 *  Pass [android] to override the Android channel/sound (e.g. the ring). */
async function sendFCM(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  android?: admin.messaging.AndroidConfig,
) {
  try {
    const snap = await db.collection('users').doc(userId).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await admin.messaging().send({ token, notification: { title, body }, data, ...(android ? { android } : {}) })
  } catch (e) {
    console.error('FCM (user) error:', e)
  }
}

/** Send to a restaurant owner — reads fcmToken from restaurants/{restaurantId} */
async function sendFCMToRestaurant(restaurantId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const snap = await db.collection('restaurants').doc(restaurantId).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await admin.messaging().send({ token, notification: { title, body }, data })
  } catch (e) {
    console.error('FCM (restaurant) error:', e)
  }
}

/** Ring a restaurant like an incoming call when a new order arrives. Sent as a
 *  DATA-ONLY, high-priority message (no `notification` block) so the app's
 *  background handler runs — even when the app is swiped away/killed — and shows
 *  the continuously-ringing CallKit incoming-call screen. */
async function ringRestaurantNewOrder(restaurantId: string, orderId: string, restaurantName: string) {
  try {
    const snap = await db.collection('restaurants').doc(restaurantId).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await admin.messaging().send({
      token,
      data: { type: 'new_order', orderId, restaurantId, restaurantName },
      android: { priority: 'high' },
    })
  } catch (e) {
    console.error('FCM (restaurant ring) error:', e)
  }
}


// ─── 1. notifyNewOrder ─────────────────────────────────────────────────────────
// Fires when a customer places a new order — alerts the restaurant owner.
export const notifyNewOrder = onDocumentCreated('orders/{orderId}', async (event) => {
  const order = event.data?.data()
  if (!order) return
  if (order.status !== 'placed') return

  const restaurantId = order.restaurantId as string | undefined
  if (!restaurantId) return

  await ringRestaurantNewOrder(
    restaurantId,
    event.params.orderId,
    (order.restaurantName as string | undefined) ?? 'Symon\'s Kitchin',
  )
})

// ─── 2. notifyOrderStatus ───────────────────────────────────────────────────────
// Fires on every order status change — pushes FCM to the customer.
export const notifyOrderStatus = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return

  const MESSAGES: Record<string, { title: string; body: string }> = {
    confirmed:        { title: '👍 Order accepted!', body: 'The restaurant is preparing your order.' },
    preparing:        { title: '👨‍🍳 Preparing your order', body: 'Your food is being made fresh.' },
    driver_assigned:  { title: '📦 Order ready!', body: "We're finding a driver to deliver your order." },
    out_for_delivery: { title: '🚗 On the way!', body: 'Your driver has picked up your order.' },
    delivered:        { title: '🎉 Delivered!', body: 'Your order has arrived. Enjoy!' },
    cancelled:        { title: '❌ Order cancelled', body: 'Your order has been cancelled.' },
  }

  const msg = MESSAGES[after.status]
  if (!msg || !after.customerId) return

  // Only the "on the way" alert rings with the custom bundled sound; every
  // other status uses the normal default notification channel.
  const ringAndroid: admin.messaging.AndroidConfig | undefined =
    after.status === 'out_for_delivery'
      ? {
          priority: 'high',
          notification: {
            channelId: 'order_on_way_ring',
            sound: 'delivery_ring',
            priority: 'max',
            defaultVibrateTimings: true,
          },
        }
      : undefined

  await sendFCM(
    after.customerId as string,
    msg.title,
    msg.body,
    { orderId: event.params.orderId, status: after.status as string, type: 'order_update' },
    ringAndroid,
  )
})

// ─── 3. notifyDriversNewDelivery ────────────────────────────────────────────────
// Fires when an order becomes 'driver_assigned' (restaurant marked it ready) —
// broadcasts to all online drivers so any of them can claim it.
export const notifyDriversNewDelivery = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'driver_assigned') return

  // DATA-ONLY, high-priority broadcast (no `notification` block) so each online
  // driver's app background handler runs — even when the app is swiped
  // away/killed — and shows the continuously-ringing CallKit incoming-call
  // screen over the lock screen, just like an Uber/inDrive request.
  const restaurantName = (after.restaurantName as string | undefined) ?? 'a restaurant'
  try {
    await admin.messaging().send({
      topic: 'available_drivers',
      data: {
        type: 'new_delivery',
        orderId: event.params.orderId,
        restaurantName,
        restaurantId: (after.restaurantId as string | undefined) ?? '',
      },
      android: { priority: 'high' },
    })
  } catch (e) {
    console.error('FCM (new delivery) error:', e)
  }
})

// ─── 4. notifyCancellationRequest ───────────────────────────────────────────────
// Fires when a customer requests cancellation — alerts the restaurant owner.
export const notifyCancellationRequest = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'cancellation_requested') return

  const restaurantId = after.restaurantId as string | undefined
  if (!restaurantId) return

  const customerName = (after.customerName as string | undefined) ?? 'A customer'
  const reason = (after.cancellationReason as string | undefined) ?? 'No reason given'

  await sendFCMToRestaurant(
    restaurantId,
    '⚠️ Cancellation Request',
    `${customerName} wants to cancel their order. Reason: ${reason}`,
    { orderId: event.params.orderId, restaurantId, type: 'cancellation_request' }
  )
})

// ─── 5. notifyRestaurantApproved ────────────────────────────────────────────────
// Fires when admin approves a restaurant (status: pending → active).
export const notifyRestaurantApproved = onDocumentUpdated('restaurants/{restaurantId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'active') return

  await sendFCMToRestaurant(
    event.params.restaurantId,
    "🎉 You're approved!",
    "Your restaurant is now live on Symon's Kitchen.",
    { type: 'restaurant_approved' }
  )
})

// ─── Yoco helpers ─────────────────────────────────────────────────────────────

const YOCO_API = 'https://payments.yoco.com/api'

async function getYocoSecretKey(): Promise<string> {
  const snap = await db.collection('settings').doc('yoco').get()
  const key = snap.data()?.secretKey as string | undefined
  if (!key) throw new HttpsError('failed-precondition', 'Yoco secret key not configured. Add it in Admin → Settings.')
  return key
}

// ─── 5. initializePayment ─────────────────────────────────────────────────────
// Creates a Yoco Online Checkout and a pending order in Firestore.
// Called from the Flutter cart screen just before opening the checkout.
export const initializePayment = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const {
      restaurantId, restaurantName,
      amountRands, items,
      deliveryAddress, deliveryFee,
      deliveryLat, deliveryLng,
      customerName, successBaseUrl,
    } = request.data as {
      restaurantId: string
      restaurantName: string
      amountRands: number
      items: Array<{ name: string; quantity: number; price: number }>
      deliveryAddress: string
      deliveryFee: number
      deliveryLat?: number
      deliveryLng?: number
      customerName?: string
      successBaseUrl?: string
    }

    const secretKey = await getYocoSecretKey()
    const uid = request.auth.uid
    const email = (request.auth.token.email as string | undefined) ?? `${uid}@symonskitchen.app`
    const amountCents = Math.round(amountRands * 100)
    const subtotal = amountRands - deliveryFee

    // Pre-generate the order id so we can embed it in the redirect URLs.
    const orderRef = db.collection('orders').doc()
    const orderId = orderRef.id

    // Redirect URLs. On web we use the Flutter success route (with orderId); on
    // mobile the WebView intercepts these placeholder paths before they load.
    const successUrl = successBaseUrl
      ? `${successBaseUrl}?orderId=${orderId}`
      : 'https://symonskitchen.app/payment/success'
    const cancelUrl = successBaseUrl
      ? `${successBaseUrl.replace('/payment/success', '/payment/cancel')}?orderId=${orderId}`
      : 'https://symonskitchen.app/payment/cancel'
    const failureUrl = successBaseUrl
      ? `${successBaseUrl.replace('/payment/success', '/payment/failed')}?orderId=${orderId}`
      : 'https://symonskitchen.app/payment/failed'

    const yRes = await fetch(`${YOCO_API}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: 'ZAR',
        successUrl,
        cancelUrl,
        failureUrl,
        metadata: {
          orderId,
          restaurantId,
          customerId: uid,
          ...(customerName ? { customerName } : {}),
        },
      }),
    })

    const y = await yRes.json() as {
      id?: string
      redirectUrl?: string
      status?: string
      message?: string
    }
    if (!yRes.ok || !y.id || !y.redirectUrl) {
      console.error('Yoco checkout failed:', y.message ?? JSON.stringify(y))
      throw new HttpsError('internal', y.message || 'Could not start payment.')
    }

    // Create the pending order. The Yoco checkout id is our payment reference.
    await orderRef.set({
      customerId:       uid,
      customerEmail:    email,
      customerName:     customerName ?? null,
      restaurantId,
      restaurantName,
      items,
      subtotal,
      deliveryFee,
      total:            amountRands,
      deliveryAddress,
      ...(deliveryLat != null && { deliveryLat }),
      ...(deliveryLng != null && { deliveryLng }),
      status:           'pending_payment',
      paymentStatus:    'pending',
      paymentReference: y.id,
      paymentProvider:  'yoco',
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
    })

    return {
      authorizationUrl: y.redirectUrl,
      reference: y.id,
      orderId,
    }
  }
)

// ─── 6. verifyPayment ─────────────────────────────────────────────────────────
// Called from Flutter after checkout. Confirms the charge with Yoco,
// promotes the order to 'placed', and notifies customer + restaurant.
export const verifyPayment = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { orderId, reference: providedReference } = request.data as { orderId: string; reference?: string }
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId is required.')

    // Fetch and idempotency-check the order
    const orderSnap = await db.collection('orders').doc(orderId).get()
    const order = orderSnap.data()
    if (!order) throw new HttpsError('not-found', 'Order not found.')

    // reference may come from the caller or be looked up from the order doc
    const reference = providedReference || (order.paymentReference as string | undefined)
    if (!reference) throw new HttpsError('failed-precondition', 'No payment reference for this order.')

    const secretKey = await getYocoSecretKey()

    // Verify by fetching the checkout from Yoco (server-side, authoritative).
    const yRes = await fetch(`${YOCO_API}/checkouts/${reference}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    })
    const y = await yRes.json() as { id?: string; status?: string; paymentId?: string; message?: string }
    if (!yRes.ok || !y.status) {
      console.error('Yoco verify failed:', y.message ?? JSON.stringify(y))
      throw new HttpsError('internal', 'Could not verify payment with Yoco.')
    }

    // A completed checkout (or one carrying a paymentId) means payment succeeded.
    const paid = y.status === 'completed' || !!y.paymentId
    if (!paid) {
      console.warn(`Yoco checkout ${reference} status: ${y.status}`)
      return { status: y.status, orderId }
    }

    if (order.status !== 'pending_payment') {
      // Already processed (prior verify call)
      return { status: order.status, orderId }
    }

    // Promote to placed
    await db.collection('orders').doc(orderId).update({
      status:        'placed',
      paymentStatus: 'paid',
      paidAt:        admin.firestore.FieldValue.serverTimestamp(),
    })

    // Ring restaurant owner like an incoming call — new (paid) order waiting
    if (order.restaurantId) {
      await ringRestaurantNewOrder(
        order.restaurantId as string,
        orderId,
        (order.restaurantName as string | undefined) ?? 'Symon\'s Kitchin',
      )
    }

    // Notify customer — payment confirmed
    await sendFCM(
      request.auth.uid,
      '✅ Payment confirmed!',
      'Your order is confirmed and the restaurant has been notified.',
      { orderId, type: 'order_confirmed' }
    )

    return { status: 'placed', orderId }
  }
)

// ─── 7. processRefund ──────────────────────────────────────────────────────────
// Called by the restaurant when they confirm a customer's cancellation request.
// Calls Yoco's Refund API then marks the order cancelled + notifies the customer.
export const processRefund = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { orderId } = request.data as { orderId: string }
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId is required.')

    const orderSnap = await db.collection('orders').doc(orderId).get()
    const order = orderSnap.data()
    if (!order) throw new HttpsError('not-found', 'Order not found.')
    if (order.status !== 'cancellation_requested') {
      throw new HttpsError('failed-precondition', 'Order is not pending cancellation.')
    }

    // Attempt Yoco refund. Non-blocking — if it fails we still cancel the
    // order and notify the customer, flagging it refund_pending for follow-up.
    const reference = order.paymentReference as string | undefined
    let paymentStatus = 'cancelled'

    if (reference) {
      try {
        const secretKey = await getYocoSecretKey()
        // Yoco refunds a payment by its checkout id (full refund when no amount).
        const refundRes = await fetch(`${YOCO_API}/checkouts/${reference}/refund`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `refund-${reference}`,
          },
        })
        const refund = await refundRes.json() as { status?: string; message?: string }
        const ok = refundRes.ok &&
          ['successful', 'pending', 'created', 'processing'].includes(refund.status ?? '')
        if (ok) {
          paymentStatus = 'refunded'
          console.log(`Yoco refund initiated for ${reference}, R${order.total}`)
        } else {
          console.error(`Yoco refund failed for ${reference}:`, refund.message ?? JSON.stringify(refund))
          paymentStatus = 'refund_pending'
        }
      } catch (e) {
        console.error('Yoco refund error:', e)
        paymentStatus = 'refund_pending'
      }
    }

    // Always cancel the order regardless of the refund result
    await db.collection('orders').doc(orderId).update({
      status:        'cancelled',
      paymentStatus,
      refundedAt:    admin.firestore.FieldValue.serverTimestamp(),
    })

    // Notify customer — always
    if (order.customerId) {
      const refundMsg = paymentStatus === 'refunded'
        ? `Your refund of R${(order.total as number).toFixed(2)} is on the way. Allow 3–5 business days.`
        : `Your order has been cancelled. Your refund of R${(order.total as number).toFixed(2)} will be processed shortly.`
      await sendFCM(
        order.customerId as string,
        '✅ Cancellation Confirmed',
        refundMsg,
        { orderId, type: 'refund_initiated' }
      )
    }

    return { status: 'cancelled', paymentStatus, orderId }
  }
)

// Driver bank details are saved directly to the driver doc by the app (manual
// payout model) — no provider recipient registration or account resolution.

// ─── 8. payDriverForDelivery (manual payout ledger) ───────────────────────────
// Fires when an order is marked 'delivered'. Records what the driver is owed
// (the order's delivery fee) as a 'pending' entry in the `payouts` ledger.
// Yoco has no transfers API, so the business pays drivers out-of-band and marks
// each payout 'paid' in Admin → Driver Payouts. Idempotent via the payoutDone flag.
export const payDriverForDelivery = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'delivered') return
  if (after.payoutDone === true) return // already recorded

  const orderId = event.params.orderId
  const driverId = after.driverId as string | undefined
  const deliveryFee = (after.deliveryFee as number | undefined) ?? 0
  if (!driverId || deliveryFee <= 0) return

  // Mark immediately to prevent a duplicate ledger entry on rapid re-triggers.
  await db.collection('orders').doc(orderId).update({ payoutDone: true })

  const driverSnap = await db.collection('drivers').doc(driverId).get()
  const driver = driverSnap.data()

  await db.collection('payouts').add({
    driverId,
    driverName:        driver?.name ?? '',
    orderId,
    amountRands:       deliveryFee,
    status:            'pending', // pending → 'paid' once the admin pays it out
    bankName:          driver?.bankName ?? '',
    bankAccountNumber: driver?.bankAccountNumber ?? '',
    bankAccountName:   driver?.bankAccountName ?? '',
    createdAt:         admin.firestore.FieldValue.serverTimestamp(),
  })

  // Let the driver know a payout was added to their wallet.
  const token = driver?.fcmToken as string | undefined
  if (token) {
    await admin.messaging().send({
      token,
      notification: {
        title: '💰 You earned a payout',
        body: `R${deliveryFee.toFixed(2)} for your delivery has been added to your wallet.`,
      },
      data: { type: 'payout', orderId },
    }).catch(e => console.error('Driver payout FCM error:', e))
  }
})

// (Scheduled auto-retry of payouts removed — payouts are now settled manually
//  by the admin under Driver Payouts, so there is nothing to auto-retry.)

// ─── 9. mapsProxy ─────────────────────────────────────────────────────────────
// Proxies Google Maps web-service calls (Directions / Geocoding / Places) so the
// Flutter WEB build can use them. Those APIs don't return CORS headers, so a
// browser can't call them directly; a server can. Mobile calls Google directly.
const GOOGLE_MAPS_KEY = 'AIzaSyB4wHFe2xOgiBKAXmoENZbHwfa-bMQaE-U'
const ALLOWED_MAPS_ENDPOINTS = new Set([
  'directions/json',
  'geocode/json',
  'place/autocomplete/json',
  'place/details/json',
])

export const mapsProxy = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { endpoint, params } = request.data as {
      endpoint: string
      params: Record<string, string>
    }
    if (!ALLOWED_MAPS_ENDPOINTS.has(endpoint)) {
      throw new HttpsError('invalid-argument', 'Endpoint not allowed.')
    }

    const usp = new URLSearchParams({ ...(params || {}), key: GOOGLE_MAPS_KEY })
    const res = await fetch(`https://maps.googleapis.com/maps/api/${endpoint}?${usp.toString()}`)
    if (!res.ok) {
      console.error(`mapsProxy ${endpoint} failed: ${res.status}`)
      throw new HttpsError('internal', 'Maps request failed.')
    }
    return res.json()
  }
)
