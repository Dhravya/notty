'use client';

import Link from 'next/link';
import { Drawer } from 'vaul';
import { useEffect, useRef, useState } from 'react';
import autoAnimate from '@formkit/auto-animate';

type Value = {
  type: string;
  content: [{ type: string; content: [{ text: string; type: string }] }];
};

const extractTitle = (value: Value) => {
  let processedValue = value;

  if (typeof value === 'string') {
    // convert into object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    processedValue = JSON.parse(value);
  }

  // Searching for the text inside the 'heading' type
  const contentArray = processedValue.content ?? [];
  for (const contentItem of contentArray) {
    for (const innerContent of contentItem.content) {
      return innerContent.text.length > 36
        ? innerContent.text.substring(0, 36) + '...'
        : innerContent.text;
    }
  }
  return 'untitled';
};

const ResponsiveDrawer = ({ children }: { children: React.ReactNode }) => (
  <>
    <div className="md:hidden">
      <Drawer.Root shouldScaleBackground direction="bottom">
        {children}
      </Drawer.Root>
    </div>
    <div className="hidden md:block">
      <Drawer.Root shouldScaleBackground direction="right">
        {children}
      </Drawer.Root>
    </div>
  </>
);
export function NotesViewer() {
  const [kv, setKv] = useState<[string, Value][]>([]);

  const fetchLocalStorageData = () => {
    const entries = Object.entries(localStorage);
    const keyVal = entries
      .map(([key, value]: [key: string, value: string]) => {
        if (value && key.length === 10 && key.match(/^\d+$/)) {
          return [key, JSON.parse(value)] as [string, Value];
        }
        return undefined;
      })
      .filter((kv) => kv !== undefined);

    return keyVal as [string, Value][];
  };

  // Function to fetch data from cloud
  const fetchCloudData = async () => {
    try {
      const response = await fetch('/api/fetchPosts');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return data as [string, Value][];
    } catch (error) {
      console.error('Error fetching cloud data:', error);
      return [];
    }
  };

  // Function to combine and set data from both sources
  const combineData = async () => {
    const localData = fetchLocalStorageData();
    const cloudData = await fetchCloudData();

    // Process cloud data to match local data format
    const processedCloudData = cloudData.map(
      ([key, value]: [key: string, value: Value]) => {
        const id = key.split('-').pop(); // Extracts the id from [email]-id format
        return [id, value] as [string, Value];
      },
    );

    // Combine and set data
    setKv([...localData, ...processedCloudData]);
  };

  useEffect(() => {
    void combineData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parent = useRef(null);

  useEffect(() => {
    parent.current && autoAnimate(parent.current);
  }, [parent]);

  return (
    <ResponsiveDrawer>
      <Drawer.Trigger
        className="flex gap-2 p-2 bg-white items-center justify-center rounded-lg transition-colors duration-200 hover:bg-stone-100 active:bg-stone-200 sm:bottom-auto sm:top-5"
        asChild
      >
        <button>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
          Menu
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="bg-white flex flex-col rounded-t-[10px] h-[96%] md:h-full md:w-[400px] w-full mt-24 fixed bottom-0 right-0 z-40">
          <>
            <div className="rounded-t-[10px] flex flex-col md:flex-row h-screen">
              <div className="mx-auto md:my-auto md:ml-4 w-12 h-1.5 md:w-1.5 md:h-12 flex-shrink-0 rounded-full bg-zinc-300 mt-4 mb-8" />
              <div className="p-4 bg-white flex-1 overflow-auto mb-24 md:mb-10">
                <div className="max-w-md mx-auto">
                  <Drawer.Title className="font-medium mb-4">
                    Your notes
                  </Drawer.Title>
                  <div ref={parent} className="flex flex-col gap-3">
                    {kv.map(([key, value]: [string, Value]) => (
                      <div className="flex gap-2" key={key}>
                        <Link
                          href={`/note/${key}`}
                          className="hover:bg-stone-100 active:bg-stone-200 p-2 rounded-md w-full"
                        >
                          {key.length === 10 && key.match(/^\d+$/)
                            ? value
                              ? extractTitle(value)
                              : 'untitled'
                            : null}
                        </Link>
                        <button
                          className="hover:bg-stone-100 active:bg-stone-200 p-2 rounded-md h-10 w-10 flex items-center justify-center"
                          onClick={() => {
                            const newKey = 'archived-' + key;
                            const newValue = localStorage.getItem(key);
                            localStorage.removeItem(key);
                            localStorage.setItem(
                              newKey,
                              JSON.stringify(newValue),
                            );
                            fetchLocalStorageData();
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-4 h-4"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-zinc-100 border-t border-zinc-200 mt-auto absolute bottom-0">
              <div className="flex gap-6 justify-end max-w-md mx-auto">
                <a
                  className="text-xs text-zinc-600 flex items-center gap-0.25"
                  href="https://github.com/emilkowalski/vaul"
                  target="_blank"
                >
                  GitHub
                  <svg
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    width="16"
                    aria-hidden="true"
                    className="w-3 h-3 ml-1"
                  >
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path>
                    <path d="M15 3h6v6"></path>
                    <path d="M10 14L21 3"></path>
                  </svg>
                </a>
                <a
                  className="text-xs text-zinc-600 flex items-center gap-0.25"
                  href="https://twitter.com/emilkowalski_"
                  target="_blank"
                >
                  Twitter
                  <svg
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    width="16"
                    aria-hidden="true"
                    className="w-3 h-3 ml-1"
                  >
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path>
                    <path d="M15 3h6v6"></path>
                    <path d="M10 14L21 3"></path>
                  </svg>
                </a>
              </div>
            </div>
          </>
        </Drawer.Content>
      </Drawer.Portal>
    </ResponsiveDrawer>
  );
}
