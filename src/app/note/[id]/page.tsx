'use client';

import { NotesViewer } from '@/app/drawer';
import Menu from '@/app/ui/menu';
import { Editor } from 'novel';

function Page({ params }: { params: { id: string } }) {
  return (
    <div className="flex min-h-[100svh] flex-col items-center sm:px-5 sm:pt-[calc(20vh)] ">
      <a
        href="/"
        className="fixed z-10 bg-white flex gap-2 bottom-5 left-5 max-h-fit rounded-lg p-2 transition-colors duration-200 hover:bg-stone-100 sm:bottom-auto sm:top-5"
      >
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
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>{' '}
        New note
      </a>
      <div className="fixed flex gap-4 bottom-5 right-5 md:top-5">
        <NotesViewer />
      </div>
      <Editor
        defaultValue={
          '## welcome to notty \n`notty` is a minimal note taking app and markdown editor.'
        }
        storageKey={params.id}
        disableLocalStorage={false}
        className="novel-relative novel-min-h-[500px] novel-w-full novel-max-w-screen-lg novel-border-stone-200 sm:novel-mb-[calc(20vh)] sm:novel-rounded-lg sm:novel-border sm:novel-shadow-lg"
      />
    </div>
  );
}

export default Page;
