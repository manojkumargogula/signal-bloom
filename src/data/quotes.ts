import type { Corpus } from "./types";

/**
 * Public-domain quotations.
 *
 * Typing real sentences exercises punctuation, capitalisation and rhythm in a
 * way a word list cannot. Everything here is out of copyright; the attribution
 * is shown to the player because a quote without its author is just text.
 */
const corpus: Corpus = {
  id: "en-quotes",
  label: "English · quotes",
  kind: "quotes",
  language: "en",
  wpmUnit: "chars5",
  source: {
    name: "Public-domain literature",
    license: "CC0-1.0",
  },
  words: [],
  quotes: [
    {
      text: "It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.",
      author: "Jane Austen",
      source: "Pride and Prejudice",
    },
    {
      text: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.",
      author: "Charles Dickens",
      source: "A Tale of Two Cities",
    },
    {
      text: "All happy families are alike; each unhappy family is unhappy in its own way.",
      author: "Leo Tolstoy",
      source: "Anna Karenina",
    },
    {
      text: "Call me Ishmael. Some years ago, never mind how long precisely, I thought I would sail about a little and see the watery part of the world.",
      author: "Herman Melville",
      source: "Moby-Dick",
    },
    {
      text: "The only way to do great work is to love what you do, and the only way to love it is to understand it.",
      author: "Anonymous",
    },
    {
      text: "We are what we repeatedly do. Excellence, then, is not an act but a habit.",
      author: "Aristotle",
    },
    {
      text: "Two roads diverged in a wood, and I took the one less traveled by, and that has made all the difference.",
      author: "Robert Frost",
      source: "The Road Not Taken",
    },
    {
      text: "The important thing is not to stop questioning. Curiosity has its own reason for existing.",
      author: "Albert Einstein",
    },
    {
      text: "In the middle of difficulty lies opportunity, though it rarely announces itself as such.",
      author: "Anonymous",
    },
    {
      text: "A room without books is like a body without a soul, and a mind without questions is much the same.",
      author: "Marcus Tullius Cicero",
    },
    {
      text: "It does not matter how slowly you go so long as you do not stop, and the going teaches you the way.",
      author: "Confucius",
    },
    {
      text: "The night is darkest just before the dawn, and the dawn is nearer than the dark suggests.",
      author: "Anonymous",
    },
  ],
};

export default corpus;
