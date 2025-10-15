"use client";

import Warning from "@/components/warning";
import useNotes from "@/lib/context/NotesContext";
import { Editor } from "novel";
import { useEffect, useState } from "react";
import { type JSONContent } from "@tiptap/core";
import { SupermemoryChatDialog } from "@/components/SupermemoryChatDialog";
import { SupermemoryChatExtension } from "@/lib/extensions/SupermemoryChatExtension";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

function NovelEditor({ id }: { id: string }) {
  const [data, setData] = useState<JSONContent | string>("");
  const [cloudData, setCloudData] = useState<JSONContent | string>("");
  const [syncWithCloudWarning, setSyncWithCloudWarning] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentNoteContent, setCurrentNoteContent] = useState("");

  const { revalidateNotes, kv } = useNotes();

  const handleOpenChat = () => {
    setIsChatOpen(true);
  };

  const loadData = async () => {
    try {
      const response = await fetch(`/api/note?id=${id}`);

      if (response.status === 404) {
        return null;
      } else if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const jsonData = (await response.json()) as JSONContent;
      return jsonData;
    } catch (error) {
      console.error("Error loading data from cloud:", error);
      return null;
    }
  };

  // Effect to synchronize data
  useEffect(() => {
    const synchronizeData = async () => {
      const cloud = await loadData();
      if (cloud) {
        setCloudData(cloud);

        const local = localStorage.getItem(id);
        if (local) {
          setData(local);
          if (local !== JSON.stringify(cloud)) {
            setSyncWithCloudWarning(true);
          }
        } else {
          setData(cloud);
          localStorage.setItem(id, JSON.stringify(cloud));
        }
      }
    };

    void synchronizeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleKeepLocalStorage = () => {
    setSyncWithCloudWarning(false);
  };

  const handleKeepCloudStorage = () => {
    localStorage.setItem(id, JSON.stringify(cloudData));
    setData(cloudData);
    setSyncWithCloudWarning(false);
  };

  return (
    <>
      {syncWithCloudWarning && (
        <Warning
          handleKeepLocalStorage={handleKeepLocalStorage}
          handleKeepCloudStorage={handleKeepCloudStorage}
        />
      )}
      <div className="relative w-full max-w-screen-lg pb-8">
        <div className="absolute right-5 top-5 z-10 mb-5 flex items-center gap-2">
          <Button
            onClick={handleOpenChat}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <Bot className="h-4 w-4" />
            Ask Supermemory
          </Button>
          <div className="rounded-lg bg-stone-100 px-2 py-1 text-sm text-stone-400 dark:bg-stone-800">
            {saveStatus}
          </div>
        </div>
        <Editor
          key={JSON.stringify(data)}
          defaultValue={data}
          storageKey={id}
          className="novel-relative novel-min-h-[500px] novel-w-full novel-max-w-screen-lg novel-border-stone-200 sm:novel-mb-[calc(20vh)] sm:novel-rounded-lg sm:novel-border sm:novel-shadow-lg"
          // TODO: UPLOAD IMAGES THROUGH /API/UPLOAD
          completionApi="/api/generate"
          extensions={[SupermemoryChatExtension(handleOpenChat)]}
          onUpdate={(editor) => {
            setSaveStatus("Unsaved");
            if (editor) {
              setCurrentNoteContent(editor.getText());
            }
          }}
          onDebouncedUpdate={async (value) => {
            if (!value) return;
            const kvValue = kv.find(([key]) => key === id);
            const kvValueFirstLine =
              kvValue?.[1]?.content?.[0]?.content?.[0]?.text?.split("\n")?.[0];

            // if first line edited, revalidate notes
            if (
              kvValueFirstLine &&
              value.getText().split("\n")[0] !== kvValueFirstLine
            ) {
              void revalidateNotes();
            }

            setSaveStatus("Saving...");
            const response = await fetch("/api/note", {
              method: "POST",
              body: JSON.stringify({ id, data: value.getJSON() }),
            });
            const res = await response.text();
            setSaveStatus(res);
          }}
        />
      </div>

      <SupermemoryChatDialog
        open={isChatOpen}
        onOpenChange={setIsChatOpen}
        noteContent={currentNoteContent}
      />
    </>
  );
}

export default NovelEditor;
