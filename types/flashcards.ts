export type Difficulty = "easy" | "medium" | "hard"

export interface Flashcard {
  id: string
  subject: string
  topic: string
  difficulty: Difficulty
  question: string
  answer: string
  explanation?: string
  tags: string[]
}

export interface FlashcardTopic {
  id: string
  title: string
  cards: Flashcard[]
}

export interface FlashcardSubject {
  id: string
  title: string
  year: 1 | 2 | 3
  icon: string
  color: string
  topics: FlashcardTopic[]
}

export interface StudySession {
  id: string
  date: Date
  correct: number
  incorrect: number
  cards: string[]
  mode: string
}

export interface Topic {
  id: string
  title: string // Now a simple string
  description: string // Now a simple string
  cards: Flashcard[]
}

export interface Subject {
  id: string
  title: string // Now a simple string
  icon: string
  className: string
  topics: Topic[]
}
