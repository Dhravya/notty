import { useCallback, useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";
import { Extension } from "@tiptap/core";
import { useNotes } from "../context/NotesContext";
import { useAuth } from "../context/AuthContext";
import { Warning } from "./Warning";
import { useCollaboration } from "../hooks/useCollaboration";

interface TiptapEditorProps {
  id: string;
}

const defaultMarkdown = `# Welcome to Notty notes!

## Features

Notty is *an AI-powered notes app* built for **productivity and speed**. Type \`++\` for the "Continue writing" AI feature.

You can also *Talk to your notes or search using AI*, but you need to sign in for that first. Features include:

- **Real-time collaboration** - Edit notes with multiple people simultaneously
- **AI-powered search** - Ask questions about your notes using Supermemory
- **Local-first with cloud sync** - Your notes work offline and sync when online
- **PWA support** - Install as an app on any device

## Support

Notty is open source. Check out the code at [github.com/dhravya/notty](https://github.com/dhravya/notty). A star would be *really appreciated.*

## Credits

This project is built on amazing open source projects including:

- [Tiptap](https://tiptap.dev) - The headless editor framework
- [Supermemory](https://supermemory.ai) - AI memory for search
- [Vaul](https://vaul.emilkowal.ski) - Drawer component
- [Better Auth](https://better-auth.com) - Authentication
`;

// Auto-heading extension: converts first line to H1 automatically
const AutoHeading = Extension.create({
  name: "autoHeading",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection, doc } = state;
        const { $from } = selection;

        // Check if we're in the first block
        if ($from.depth === 1 && $from.index(0) === 0) {
          const firstNode = doc.firstChild;
          if (firstNode && firstNode.type.name === "paragraph") {
            // Convert first paragraph to heading
            editor
              .chain()
              .setNode("heading", { level: 1 })
              .run();
          }
        }
        return false;
      },
    };
  },
});

export function TiptapEditor({ id }: TiptapEditorProps) {
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [cloudData, setCloudData] = useState<string | null>(null);
  const [syncWithCloudWarning, setSyncWithCloudWarning] = useState(false);
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { revalidateNotes, notes } = useNotes();
  const { user } = useAuth();

  // Real-time collaboration hook
  const { isConnected, connectedUsers } = useCollaboration(id, user);

  // Load data from cloud and local
  const loadData = useCallback(async () => {
    const localKey = `note-md-${id}`;
    const localData = localStorage.getItem(localKey);

    // Try to load from cloud
    let cloud: string | null = null;
    try {
      const response = await fetch(`/api/notes/${id}`);
      if (response.ok) {
        const data = (await response.json()) as { markdown?: string };
        cloud = data.markdown || null;
        setCloudData(cloud);
      }
    } catch {
      // Cloud fetch failed
    }

    if (cloud && localData && cloud !== localData) {
      setSyncWithCloudWarning(true);
      setInitialContent(localData);
    } else if (cloud) {
      setInitialContent(cloud);
      localStorage.setItem(localKey, cloud);
    } else if (localData) {
      setInitialContent(localData);
    } else {
      setInitialContent(defaultMarkdown);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleKeepLocalStorage = () => {
    setSyncWithCloudWarning(false);
  };

  const handleKeepCloudStorage = () => {
    if (cloudData && editor) {
      const localKey = `note-md-${id}`;
      localStorage.setItem(localKey, cloudData);
      setInitialContent(cloudData);
      editor.commands.setContent(cloudData);
    }
    setSyncWithCloudWarning(false);
  };

  // Save function
  const saveToCloud = useCallback(
    async (markdown: string) => {
      setSaveStatus("Saving...");

      const localKey = `note-md-${id}`;
      localStorage.setItem(localKey, markdown);

      try {
        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, markdown }),
        });

        if (response.ok) {
          const result = await response.text();
          setSaveStatus(result || "Saved");
        } else {
          setSaveStatus("Saved locally");
        }
      } catch {
        setSaveStatus("Saved locally");
      }

      // Revalidate notes list if title changed
      const firstLine = markdown.split("\n")[0]?.replace(/^#*\s*/, "") || "";
      const existingNote = notes.find(([key]) => key === id);
      if (existingNote && existingNote[1]?.title !== firstLine) {
        revalidateNotes();
      }
    },
    [id, notes, revalidateNotes]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        history: {
          depth: 100,
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading" && node.attrs.level === 1) {
            return "Title...";
          }
          return "Start writing... (Type ++ for AI completion)";
        },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Underline,
      Typography,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      AutoHeading,
    ],
    content: initialContent || defaultMarkdown,
    editorProps: {
      attributes: {
        class: "tiptap focus:outline-none min-h-[500px] px-8 py-4",
      },
      handleKeyDown: (view, event) => {
        // Handle ++ for AI completion
        if (event.key === "+" && !isGenerating) {
          const { from } = view.state.selection;
          const textBefore = view.state.doc.textBetween(Math.max(0, from - 1), from);
          if (textBefore === "+") {
            event.preventDefault();
            view.dispatch(view.state.tr.delete(from - 1, from));
            handleAIComplete();
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setSaveStatus("Unsaved");

      // Debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const markdown = editor.storage.markdown.getMarkdown();
        saveToCloud(markdown);
      }, 1000);
    },
    immediatelyRender: false,
  });

  // AI completion handler
  const handleAIComplete = useCallback(async () => {
    if (!editor || isGenerating) return;

    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 1000), from);

    if (!textBefore.trim()) return;

    setIsGenerating(true);
    setSaveStatus("AI writing...");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: textBefore }),
      });

      if (!response.ok) {
        setSaveStatus("AI error");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        editor.commands.insertContent(text);
      }

      setSaveStatus("Unsaved");
    } catch (error) {
      console.error("AI completion error:", error);
      setSaveStatus("AI error");
    } finally {
      setIsGenerating(false);
    }
  }, [editor, isGenerating]);

  // Update editor content when initialContent changes
  useEffect(() => {
    if (editor && initialContent && !editor.isDestroyed) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!initialContent) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {syncWithCloudWarning && (
        <Warning
          handleKeepLocalStorage={handleKeepLocalStorage}
          handleKeepCloudStorage={handleKeepCloudStorage}
        />
      )}
      <div className="relative w-full max-w-screen-lg pb-8">
        <div className="absolute right-5 top-5 mb-5 flex items-center gap-2 z-10">
          {isConnected && connectedUsers.length > 0 && (
            <div className="flex -space-x-2">
              {connectedUsers.slice(0, 3).map((u, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-xs"
                  title={u}
                >
                  {u.charAt(0).toUpperCase()}
                </div>
              ))}
              {connectedUsers.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-400 border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-xs">
                  +{connectedUsers.length - 3}
                </div>
              )}
            </div>
          )}
          <div
            className={`rounded-lg px-2 py-1 text-sm ${
              isGenerating
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                : "bg-stone-100 text-stone-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {saveStatus}
          </div>
        </div>
        <div className="min-h-[500px] w-full max-w-screen-lg border-stone-200 dark:border-gray-700 sm:mb-[calc(20vh)] sm:rounded-lg sm:border sm:shadow-lg bg-white dark:bg-gray-900">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
