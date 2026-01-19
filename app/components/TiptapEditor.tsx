import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import type { JSONContent } from "@tiptap/core";
import { useNotes } from "../context/NotesContext";
import { useAuth } from "../context/AuthContext";
import { Warning } from "./Warning";
import { defaultData } from "../data/defaultNote";
import { useCollaboration } from "../hooks/useCollaboration";

interface TiptapEditorProps {
  id: string;
}

export function TiptapEditor({ id }: TiptapEditorProps) {
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [cloudData, setCloudData] = useState<JSONContent | null>(null);
  const [syncWithCloudWarning, setSyncWithCloudWarning] = useState(false);
  const [initialContent, setInitialContent] = useState<JSONContent | null>(null);

  const { revalidateNotes, notes } = useNotes();
  const { user } = useAuth();

  // Real-time collaboration hook
  const { isConnected, connectedUsers } = useCollaboration(id, user);

  // Load data from cloud and local
  const loadData = useCallback(async () => {
    // Try to load from local storage first
    const localData = localStorage.getItem(id);
    let local: JSONContent | null = null;
    if (localData) {
      try {
        local = JSON.parse(localData);
      } catch {
        local = null;
      }
    }

    // Try to load from cloud
    let cloud: JSONContent | null = null;
    try {
      const response = await fetch(`/api/notes/${id}`);
      if (response.ok) {
        cloud = await response.json();
        setCloudData(cloud);
      }
    } catch {
      // Cloud fetch failed, use local
    }

    // Determine which data to use
    if (cloud && local) {
      // Both exist, check if they're different
      if (JSON.stringify(local) !== JSON.stringify(cloud)) {
        setSyncWithCloudWarning(true);
      }
      setInitialContent(local);
    } else if (cloud) {
      setInitialContent(cloud);
      localStorage.setItem(id, JSON.stringify(cloud));
    } else if (local) {
      setInitialContent(local);
    } else {
      // No data, use default
      setInitialContent(defaultData as JSONContent);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleKeepLocalStorage = () => {
    setSyncWithCloudWarning(false);
  };

  const handleKeepCloudStorage = () => {
    if (cloudData) {
      localStorage.setItem(id, JSON.stringify(cloudData));
      setInitialContent(cloudData);
      editor?.commands.setContent(cloudData);
    }
    setSyncWithCloudWarning(false);
  };

  // Save function
  const saveToCloud = useCallback(
    async (content: JSONContent) => {
      setSaveStatus("Saving...");

      // Save to local storage immediately
      localStorage.setItem(id, JSON.stringify(content));

      // Save to cloud if logged in
      try {
        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, data: content }),
        });
        const text = await response.text();
        setSaveStatus(text);
      } catch {
        setSaveStatus("Saved locally");
      }

      // Check if first line changed for revalidation
      const kvValue = notes.find(([key]) => key === id);
      const currentText = editor?.getText() || "";
      const kvFirstLine = kvValue?.[1]?.content?.[0]?.content?.[0]?.text?.split("\n")[0];
      const currentFirstLine = currentText.split("\n")[0];

      if (currentFirstLine !== kvFirstLine) {
        revalidateNotes();
      }
    },
    [id, notes, revalidateNotes]
  );

  // AI completion handler
  const handleAIComplete = useCallback(async () => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 500), from);

    if (!textBefore.trim()) return;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: textBefore }),
      });

      if (!response.ok) return;

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        editor.commands.insertContent(text);
      }
    } catch (error) {
      console.error("AI completion error:", error);
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: {
          depth: 100,
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing... (Type ++ for AI completion)",
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "text-blue-600 underline underline-offset-2 hover:text-blue-800",
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
    ],
    content: initialContent || defaultData,
    editorProps: {
      attributes: {
        class: "prose prose-stone max-w-none focus:outline-none min-h-[500px] px-8 py-4",
      },
      handleKeyDown: (view, event) => {
        // Handle ++ for AI completion
        if (event.key === "+") {
          const { from } = view.state.selection;
          const textBefore = view.state.doc.textBetween(Math.max(0, from - 1), from);
          if (textBefore === "+") {
            // Delete the first + and trigger AI
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
    },
    immediatelyRender: false,
  });

  // Update editor content when initialContent changes
  useEffect(() => {
    if (editor && initialContent && !editor.isDestroyed) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  // Debounced save on update
  useEffect(() => {
    if (!editor) return;

    const timeoutId = setTimeout(() => {
      const content = editor.getJSON();
      saveToCloud(content);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [editor?.state.doc, saveToCloud]);

  if (!initialContent) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <p className="text-gray-500">Loading...</p>
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
        <div className="absolute right-5 top-5 mb-5 flex items-center gap-2">
          {isConnected && connectedUsers.length > 0 && (
            <div className="flex -space-x-2">
              {connectedUsers.slice(0, 3).map((u, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-white text-xs"
                  title={u}
                >
                  {u.charAt(0).toUpperCase()}
                </div>
              ))}
              {connectedUsers.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center text-white text-xs">
                  +{connectedUsers.length - 3}
                </div>
              )}
            </div>
          )}
          <div className="rounded-lg bg-stone-100 px-2 py-1 text-sm text-stone-400">
            {saveStatus}
          </div>
        </div>
        <div className="min-h-[500px] w-full max-w-screen-lg border-stone-200 sm:mb-[calc(20vh)] sm:rounded-lg sm:border sm:shadow-lg">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
