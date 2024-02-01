'use client';

import Warning from '@/components/warning';
import { Editor } from 'novel';
import { useEffect, useState } from 'react';

function NovelEditor({ id }: { id: string }) {
  const [data, setData] = useState('');
  const [cloudData, setCloudData] = useState('');
  const [syncWithCloudWarning, setSyncWithCloudWarning] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved');

  // Function to load data from cloud
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadData = async () => {
    try {
      const response = await fetch(`/api/note?id=${id}`);

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonData = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return jsonData;
    } catch (error) {
      console.error('Error loading data from cloud:', error);
      return null;
    }
  };

  // Effect to synchronize data
  useEffect(() => {
    const synchronizeData = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const cloud = await loadData();
      if (cloud) {
        setCloudData(cloud as string);

        const local = localStorage.getItem(id);
        if (local) {
          setData(local);
          if (local !== JSON.stringify(cloud)) {
            setSyncWithCloudWarning(true);
          }
        } else {
          setData(cloud as string);
        }
      }
    };

    void synchronizeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Handlers for resolving conflict
  const handleKeepLocalStorage = () => {
    // Push local data to cloud
    // Add your logic to update cloud data
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
        <div className="absolute right-5 top-5 mb-5 rounded-lg bg-stone-100 px-2 py-1 text-sm text-stone-400">
          {saveStatus}
        </div>
        <Editor
          key={data}
          defaultValue={data}
          storageKey={id}
          className="novel-relative novel-min-h-[500px] novel-w-full novel-max-w-screen-lg novel-border-stone-200 sm:novel-mb-[calc(20vh)] sm:novel-rounded-lg sm:novel-border sm:novel-shadow-lg"
          // TODO: UPLOAD IMAGES THROUGH /API/UPLOAD
          completionApi="/api/generate"
          onUpdate={(_) => {
            setSaveStatus('Unsaved');
          }}
          onDebouncedUpdate={async (value) => {
            if (!value) return;

            // window.scrollBy({
            //   top: 100,
            //   behavior: 'smooth',
            // });

            setSaveStatus('Saving...');
            const response = await fetch('/api/note', {
              method: 'POST',
              body: JSON.stringify({ id, data: value.getJSON() }),
            });
            const res = await response.text();
            setSaveStatus(res);
          }}
        />
      </div>
    </>
  );
}

export default NovelEditor;
