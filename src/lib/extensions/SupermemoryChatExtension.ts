import { Extension } from '@tiptap/core';

// This extension adds a keyboard shortcut (Mod-k) to open Supermemory chat
// and provides a command that can be called from anywhere
export const SupermemoryChatExtension = (onOpenChat: () => void) =>
  Extension.create({
    name: 'supermemory-chat',

    addKeyboardShortcuts() {
      return {
        // Mod-k (Ctrl-k on Windows/Linux, Cmd-k on Mac)
        'Mod-k': () => {
          onOpenChat();
          return true;
        },
      };
    },

    addCommands() {
      return {
        openSupermemoryChat:
          () =>
          ({ commands }) => {
            onOpenChat();
            return true;
          },
      };
    },
  });
