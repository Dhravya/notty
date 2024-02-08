'use client'

import { redirect } from 'next/navigation'

function Route() {
    // Generate a 10 digit number
    const nextNoteId = Math.floor(Math.random() * 9000000000) + 1000000000;

    return redirect(`/note?id=${nextNoteId}`);
}

export default Route