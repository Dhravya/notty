export const defaultData = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        { type: "text", text: "Welcome to Notty notes! " },
        { type: "text", marks: [{ type: "code" }], text: "notty.dhr.wtf" },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Features" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Notty is " },
        { type: "text", marks: [{ type: "italic" }], text: "an AI-powered notes app " },
        { type: "text", text: "built for " },
        {
          type: "text",
          marks: [{ type: "bold" }],
          text: "productivity and speed",
        },
        { type: "text", text: ". Type " },
        { type: "text", marks: [{ type: "code" }], text: "++" },
        { type: "text", text: " for the " },
        { type: "text", marks: [{ type: "italic" }], text: '"Continue writing"' },
        { type: "text", text: " AI feature. " },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "You can also " },
        {
          type: "text",
          marks: [{ type: "italic" }],
          text: "Talk to your notes or search using AI",
        },
        { type: "text", text: ", but you need to sign in for that first. " },
        { type: "text", text: "Features include:" },
      ],
    },
    {
      type: "bulletList",
      attrs: { tight: true },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Real-time collaboration",
                },
                { type: "text", text: " - Edit notes with multiple people simultaneously" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "AI-powered search",
                },
                {
                  type: "text",
                  text: " - Ask questions about your notes using Supermemory",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Local-first with cloud sync",
                },
                { type: "text", text: " - Your notes work offline and sync when online" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "PWA support",
                },
                { type: "text", text: " - Install as an app on any device" },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Support" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Notty is open source. Check out the code at " },
        {
          type: "text",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://github.com/dhravya/notty",
                target: "_blank",
              },
            },
          ],
          text: "github.com/dhravya/notty",
        },
        { type: "text", text: ". A star would be " },
        { type: "text", marks: [{ type: "italic" }], text: "really appreciated." },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Credits" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This project is built on amazing open source projects including:",
        },
      ],
    },
    {
      type: "bulletList",
      attrs: { tight: true },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "https://tiptap.dev", target: "_blank" },
                    },
                  ],
                  text: "Tiptap",
                },
                { type: "text", text: " - The headless editor framework" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "https://supermemory.ai", target: "_blank" },
                    },
                  ],
                  text: "Supermemory",
                },
                { type: "text", text: " - AI memory for search" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "https://vaul.emilkowal.ski", target: "_blank" },
                    },
                  ],
                  text: "Vaul",
                },
                { type: "text", text: " - Drawer component" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "https://better-auth.com", target: "_blank" },
                    },
                  ],
                  text: "Better Auth",
                },
                { type: "text", text: " - Authentication" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
