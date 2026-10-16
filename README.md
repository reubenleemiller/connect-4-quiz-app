# QuizFour

A two-team Connect 4 quiz game built with React, Tailwind CSS, and Vite. It deploys directly to Vercel.

## Google Slides question decks

The app starts without a sample deck. Paste a Google Slides URL into **Slide source**. The deck must be shared as **Anyone with the link can view**. Each question slide should use this simple structure:

```text
Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Mercury
Answer: B
```

The importer also accepts `A.`, `A:`, or `A -` choices, plus `Correct answer: A`. The question, choices, and answer must be editable Google Slides text rather than part of an image.

QuizFour embeds each source slide during play. Put the `Answer:` line in the bottom footer area of the slide: the app masks the bottom 17% of the embedded slide so students cannot see it, while still showing the slide and its question choices. Public Google Slides text export does not include speaker notes, so keep the answer as editable footer text instead of placing it in notes.

Separate slides naturally in Google Slides. The Vercel function exports the public deck as text, turns valid slides into question tiles, and shows the selected slide alongside the question. A tile is greyed out as soon as its question is answered or times out.

## Run locally

```bash
npm install
npm run dev
```

For local deck imports, run `vercel dev` (not `npm run dev`) so the `/api/slides` function runs as an API endpoint. On Vercel, no environment variables are required for public decks.

## Live student matches

The app supports code-based invitations and random student pairing through Supabase.

1. In the new `connect-4-quiz-app` Supabase project, enable **Authentication → Providers → Anonymous sign-ins**.
2. Run [docs/supabase-multiplayer-setup.sql](docs/supabase-multiplayer-setup.sql) in the project’s SQL Editor.
3. Copy `.env.example` to `.env.local` and add the project URL plus its **publishable** key. For Vercel, add the same variables under **Project Settings → Environment Variables**, then redeploy.

The app never uses a service-role key. Anonymous students can only read rooms in which they are a player; game creation, joining, and state changes are handled through narrowly scoped database functions.

In the app, choose **Play with another student**. Select **Find a random opponent** to enter the random queue, or **Create private room** to generate a six-character room code and a scannable invite QR. The host receives a **Start game** button as soon as their opponent joins.
