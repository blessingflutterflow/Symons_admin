import * as admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'

admin.initializeApp()
const db = admin.firestore()

// ─── FCM helpers ──────────────────────────────────────────────────────────────

/** Send to a customer — reads fcmToken from users/{userId} */
async function sendFCM(userId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const snap = await db.collection('users').doc(userId).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await admin.messaging().send({ token, notification: { title, body }, data })
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

/**
 * Broadcast to every driver currently subscribed to the 'available_drivers'
 * topic. Symon's Kitchen uses a claim model — any online driver can accept a
 * 'driver_assigned' order, so we notify all of them rather than a single one.
 */
async function sendFCMToDriversTopic(title: string, body: string, data?: Record<string, string>) {
  try {
    await admin.messaging().send({ topic: 'available_drivers', notification: { title, body }, data })
  } catch (e) {
    console.error('FCM (drivers topic) error:', e)
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

  await sendFCMToRestaurant(
    restaurantId,
    '🛎️ New Order!',
    `New order received — R${order.total}.`,
    { orderId: event.params.orderId, restaurantId, type: 'new_order' }
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

  await sendFCM(
    after.customerId as string,
    msg.title,
    msg.body,
    { orderId: event.params.orderId, status: after.status as string, type: 'order_update' }
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

  await sendFCMToDriversTopic(
    '🛵 New Delivery Available!',
    `Pickup from ${after.restaurantName ?? 'a restaurant'}`,
    { orderId: event.params.orderId, type: 'new_delivery' }
  )
})

// ─── 4. notifyRestaurantApproved ────────────────────────────────────────────────
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
