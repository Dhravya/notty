"use client";

import { notFound } from "next/navigation";
import NovelEditor from "./[id]/novelEditor";

function Page({ searchParams }: { searchParams: { id: string } }) {

    if (!searchParams.id){
        notFound()
    }

    return (
        <div className="mb-12 flex min-h-[100svh] flex-col items-center sm:px-5 sm:pt-[calc(20vh)] md:mb-0">
            <NovelEditor id={searchParams.id} />
        </div>
    );
}

export default Page;
