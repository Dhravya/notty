'use client'

import useNotes from '@/lib/context/NotesContext'
import { redirect } from 'next/navigation'

function NewNoteButton() {
    const { kv } = useNotes()

    const numberOfNotes = kv.length

    // Note IDs should be 10 digit long, starting from 1000000000
    const nextNoteId = 1000000000 + numberOfNotes + 1

    return redirect(`/note/${nextNoteId}`)
}

export default NewNoteButton