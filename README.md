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

The importer also accepts `A.`, `A:`, or `A -` choices, plus `Correct answer: A`.

QuizFour displays the exact source slide for each question during play. Presenter notes are used only to read the answer key; they are never shown to students, so no part of an image-only slide is hidden.

Image-only question slides are also supported. Put the complete question and choices in the image, then put only the correct letter in that slide's presenter notes — for example `C` or `Answer: C`. The app uses the notes as the answer key and displays four A), B), C), and D) response buttons over the visual slide. Each image-only slide needs its own presenter-note answer.

Separate slides naturally in Google Slides. The Vercel function exports the public deck as text, turns valid slides into question tiles, and shows the selected slide alongside the question. A tile is greyed out as soon as its question is answered or times out.

## Smartboard mode

Use the **Smartboard** button in the top bar on the classroom display. It expands the board layout on large screens, increases the Connect 4 and answer touch targets, improves focus visibility, and shows image-slide answers as large letter buttons. This is a local display preference, so turning it on for a projector or Smartboard does not change the view for students in an online match.

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
3. Copy `.env.example` to `.env.local` and add the project URL plus its **publishable** key. The values must be named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. For Vercel, add the same variables under **Project Settings → Environment Variables**, then redeploy.

The app never uses a service-role key. Anonymous students can only read rooms in which they are a player; game creation, joining, and state changes are handled through narrowly scoped database functions.

### Keep Supabase awake

This repo includes a GitHub Actions workflow (`.github/workflows/ping-supabase-keepalive.yml`) that pings
`/api/ping-supabase` every 6 hours and on manual dispatch.
Set the repository secret `SUPABASE_KEEPALIVE_URL` to your deployed endpoint URL (for example
`https://<your-vercel-domain>/api/ping-supabase`).

The endpoint accepts both `GET` and `POST` for manual keepalive.
For a one-time ping after deploy, run:

```bash
curl -X POST https://<your-vercel-domain>/api/ping-supabase
```

In the app, choose **Play with another student**. Select **Find a random opponent** to enter the random queue, or **Create private room** to generate a six-character room code and a scannable invite QR. The host receives a **Start game** button as soon as their opponent joins.

## Teacher Mode

After importing a deck, open **Teacher mode** from the main page and turn it on. Choose whether students may use private study rooms, random pairing, or both, then select **Create student link**. Share that link with the class.

With **Share protected deck** on, students receive the attached deck automatically and cannot replace it. With it off, the link still scopes pairing and private rooms to that class, but each room can load its own deck without changing any other room.

Teacher Mode uses the Supabase SQL setup above. Re-run the current [setup script](docs/supabase-multiplayer-setup.sql) in the SQL Editor before deploying this feature; it safely adds the classroom table, room fields, and RPC functions to an existing installation.
