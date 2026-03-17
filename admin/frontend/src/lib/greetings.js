/**
 * Returns a time-of-day greeting with panda personality.
 * @returns {{ greeting: string, emoji: string, subtitle: string }}
 */
export function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 6) {
    return {
      greeting: 'Up late, huh?',
      emoji: '🌙',
      subtitle: 'The panda is keeping watch while you sleep',
    }
  }
  if (hour < 12) {
    return {
      greeting: 'Good morning!',
      emoji: '🌅',
      subtitle: 'Fresh bamboo, fresh start',
    }
  }
  if (hour < 17) {
    return {
      greeting: 'Good afternoon!',
      emoji: '☀️',
      subtitle: 'Everything is caching along nicely',
    }
  }
  if (hour < 21) {
    return {
      greeting: 'Good evening!',
      emoji: '🌆',
      subtitle: 'Time to check on the cache garden',
    }
  }
  return {
    greeting: 'Night owl mode!',
    emoji: '🦉',
    subtitle: 'The panda is still awake with you',
  }
}

/**
 * Returns a panda-personality health message.
 * @param {boolean} healthy
 * @returns {string}
 */
export function getHealthMessage(healthy) {
  if (healthy) {
    const messages = [
      "Everything's looking great!",
      'All systems purring along!',
      'Cache is happy and healthy!',
      'Smooth sailing ahead!',
    ]
    return messages[Math.floor(Math.random() * messages.length)]
  }
  return 'Heads up — some things need attention'
}
