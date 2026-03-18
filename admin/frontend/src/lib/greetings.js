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

export function getHealthMessage(healthStatus, warnings) {
  if (healthStatus === 'critical') {
    return warnings?.[0] || 'Critical issues detected'
  }
  if (healthStatus === 'warning') {
    return warnings?.[0] || 'Some things need attention'
  }

  // Rotate healthy messages every 30 seconds
  const now = Date.now()
  if (now - lastRotateTime > 30000) {
    currentMessageIndex = (currentMessageIndex + 1) % healthyMessages.length
    lastRotateTime = now
  }

  return healthyMessages[currentMessageIndex]
}
