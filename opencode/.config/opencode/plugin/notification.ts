export const NotificationPlugin = async ({ client, $ }) => {
  return {
    event: async ({ event }) => {
      // Play sound effects when things happen
      if (event.type === "session.idle") {
        await $`afplay ~/dotfiles/opencode/plugin/notification.mp3`.quiet();
      }

      if (event.type === "session.error") {
        await $`afplay ~/dotfiles/opencode/plugin/notification.mp3`.quiet();
      }

      if (event.type === "permission.updated") {
        await $`afplay ~/dotfiles/opencode/plugin/notification.mp3`.quiet();
      }
    },
  }
}
