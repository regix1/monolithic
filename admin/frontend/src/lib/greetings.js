export function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 6) {
    return { greeting: 'Up late, huh?', emoji: '🌙' }
  }
  if (hour < 12) {
    return { greeting: 'Good morning!', emoji: '🌅' }
  }
  if (hour < 17) {
    return { greeting: 'Good afternoon!', emoji: '☀️' }
  }
  if (hour < 21) {
    return { greeting: 'Good evening!', emoji: '🌆' }
  }
  return { greeting: 'Night owl mode!', emoji: '🦉' }
}

const healthyMessages = [
  'All systems running smoothly',
  'Cache is happy and healthy!',
  'Everything looks great!',
  'Smooth sailing ahead!',
  'All services purring along!',
  'Nothing to worry about!',
]

let currentMessageIndex = 0
let lastRotateTime = 0

/**
 * Returns the headline shown next to the page greeting. Accepts either a list
 * of strings (legacy) or a list of structured HealthWarning objects with a
 * `.message` field — that way the Dashboard can pass its structured warnings
 * straight through without flattening.
 *
 * @param {'ok'|'warning'|'critical'} healthStatus
 * @param {(string | { message?: string })[]} warnings
 */
export function getHealthMessage(healthStatus, warnings) {
  const first = warnings?.[0]
  const firstMessage = typeof first === 'string' ? first : first?.message

  if (healthStatus === 'critical') {
    return firstMessage || 'Critical issues detected'
  }
  if (healthStatus === 'warning') {
    return firstMessage || 'Some things need attention'
  }

  // Rotate healthy messages every 30 seconds
  const now = Date.now()
  if (now - lastRotateTime > 30000) {
    currentMessageIndex = (currentMessageIndex + 1) % healthyMessages.length
    lastRotateTime = now
  }

  return healthyMessages[currentMessageIndex]
}
