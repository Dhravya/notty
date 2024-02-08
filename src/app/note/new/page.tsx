'use client'

import useNotes from '@/lib/context/NotesContext'
import { redirect } from 'next/navigation'

function Route() {
    const { kv } = useNotes()

    const largestNoteId = Math.max(...kv.map((note) => parseInt(note[0])))
    const nextNoteId = largestNoteId + 1

    return redirect(`/note?id=${nextNoteId}`);
}

export default Route