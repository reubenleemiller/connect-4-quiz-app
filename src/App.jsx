import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Check, ChevronDown, CircleHelp, Clock3, Copy, Crown, Flag,
  Gamepad2, Moon, RotateCcw, Settings2, ShieldAlert, Sparkles, Sun,
  TimerReset, Trophy, UsersRound, Wifi, X,
} from 'lucide-react'
import { isSupabaseConfigured, joinMatch, saveMatchState, watchMatch } from './lib/multiplayer'
import { QRCodeSVG } from 'qrcode.react'

const ROWS = 6
const COLS = 7

const teams = [
  { id: 1, name: 'Crimson Cyclones', short: 'CC', disc: 'bg-rose-500', glow: 'shadow-[0_0_22px_rgba(244,63,94,.68)]', text: 'text-rose-300', border: 'border-rose-400/50' },
  { id: 2, name: 'Golden Sparks', short: 'GS', disc: 'bg-amber-400', glow: 'shadow-[0_0_22px_rgba(251,191,36,.7)]', text: 'text-amber-200', border: 'border-amber-300/50' },
]

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null))

function getWinner(board, rules) {
  const directions = [
    { id: 'horizontal', delta: [0, 1] },
    { id: 'vertical', delta: [1, 0] },
    { id: 'diagonalDown', delta: [1, 1] },
    { id: 'diagonalUp', delta: [1, -1] },
  ]
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const player = board[row][col]
      if (!player) continue
      for (const { id, delta: [dr, dc] } of directions) {
        if (!rules[id]) continue
        const line = Array.from({ length: 4 }, (_, i) => [row + i * dr, col + i * dc])
        if (line.every(([r, c]) => board[r]?.[c] === player)) return { player, line }
      }
    }
  }
  return null
}

function getOpenRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row -= 1) if (!board[row][col]) return row
  return -1
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function TinySpinner({ className = '' }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
}

function AppPreloader() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#f5f7fe] p-6 text-center">
      <div className="animate-pop-in">
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-spin rounded-[26px] border-[3px] border-indigo-200 border-t-indigo-600" />
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500 text-white shadow-[0_16px_38px_rgba(79,70,229,.28)]"><Gamepad2 size={27} /></div>
        </div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-indigo-600">QuizFour</p>
        <div className="mt-3 text-sm font-bold text-slate-600">Setting up the board</div>
      </div>
    </div>
  )
}

function TeamCard({ team, active, score, compact = false }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-3 transition-all duration-300 ${active ? `${team.border} bg-slate-800/90 shadow-lg ${team.glow}` : 'border-white/10 bg-slate-900/60 opacity-70'} ${compact ? 'min-w-[132px]' : ''}`}>
      {active && <div className={`absolute right-3 top-3 h-2 w-2 rounded-full ${team.disc} animate-pulse`} />}
      <div className="flex items-center gap-2.5">
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${team.disc} text-xs font-black text-slate-950 shadow-inner`}>{team.short}</div>
        <div className="min-w-0">
          <p className={`truncate text-sm font-bold ${active ? 'text-white' : 'text-slate-300'}`}>{team.name}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.13em] text-slate-400">{active ? 'On the clock' : 'Standing by'}</p>
        </div>
      </div>
      {!compact && <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-slate-400"><span>Wins</span><span className={`font-black ${team.text}`}>{score}</span></div>}
    </div>
  )
}

function TimerDial({ seconds, total }) {
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, seconds / total)
  const urgent = seconds <= 5
  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <div className={`absolute inset-0 rounded-full ${urgent ? 'animate-pulse-ring border border-rose-400/60' : ''}`} />
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="6" />
        <circle cx="55" cy="55" r={radius} fill="none" stroke={urgent ? '#fb7185' : '#818cf8'} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} className="transition-[stroke-dashoffset] duration-1000" />
      </svg>
      <span className={`absolute text-3xl font-black tabular-nums ${urgent ? 'text-rose-300' : 'text-white'}`}>{formatTime(seconds)}</span>
      <span className="absolute top-[83px] text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">remaining</span>
    </div>
  )
}

function QuestionModal({ team, question, seconds, total, timerEnabled, isSteal, canAnswer, onAnswer }) {
  const [selected, setSelected] = useState(null)
  const locked = selected !== null

  const pick = (index) => {
    if (locked || !canAnswer) return
    setSelected(index)
    window.setTimeout(() => onAnswer(index === question.answer), 520)
  }

  return (
    <div className="dialog-backdrop fixed inset-0 z-40 grid place-items-center bg-[#070b1b]/80 p-4 backdrop-blur-md">
      <section className="dialog-surface animate-pop-in relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-slate-900 shadow-2xl">
        <div className={`absolute inset-x-0 top-0 h-1 ${isSteal ? 'bg-amber-400' : 'bg-indigo-400'}`} />
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] ${isSteal ? 'border-amber-300/30 bg-amber-400/10 text-amber-200' : 'border-indigo-300/30 bg-indigo-400/10 text-indigo-200'}`}>
                {isSteal ? <ShieldAlert size={13} /> : <CircleHelp size={13} />}
                {isSteal ? 'Steal opportunity' : 'Knowledge round'}
              </div>
              <p className="text-sm font-semibold text-slate-400">{team.name}{isSteal ? ' can claim the turn' : ', earn your move'}</p>
            </div>
            {timerEnabled ? <TimerDial seconds={seconds} total={total} /> : <div className="grid h-20 w-20 place-items-center rounded-2xl border border-indigo-300/20 bg-indigo-400/10 text-center"><Clock3 size={23} className="text-indigo-300" /><span className="-mt-3 text-[9px] font-black uppercase tracking-[.14em] text-indigo-200">Untimed</span></div>}
          </div>
          {question.slideUrl && <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="flex items-center justify-between px-4 py-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-400"><span>Google Slides · Question {question.number}</span><span className="text-indigo-300">Answer key masked</span></div>
            <div className="relative">
              <iframe title={`Question ${question.number} from Google Slides`} className="h-48 w-full border-0 sm:h-60" src={question.slideUrl} allowFullScreen />
              <div className="answer-key-mask pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-[17%] items-center justify-center border-t border-white/10 text-[9px] font-black uppercase tracking-[.16em] text-indigo-200">Answer key hidden during play</div>
            </div>
          </div>}
          {question.prompt && <div className="mt-3 rounded-2xl bg-white/[.04] p-5 sm:p-6">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[.17em] text-indigo-300">{question.topic}</p>
            <h2 className="text-xl font-extrabold leading-snug text-white sm:text-2xl">{question.prompt}</h2>
          </div>}
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {question.options.map((option, index) => {
              const isChosen = selected === index
              const correct = index === question.answer
              let style = 'border-white/10 bg-white/[.035] hover:border-indigo-300/60 hover:bg-indigo-400/10'
              if (locked && isChosen) style = correct ? 'border-emerald-400 bg-emerald-400/15' : 'border-rose-400 bg-rose-400/15'
              return <button key={option} onClick={() => pick(index)} disabled={!canAnswer} className={`group flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition ${style} ${!canAnswer ? 'cursor-not-allowed opacity-55' : ''}`}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-black text-slate-300 group-hover:bg-indigo-400 group-hover:text-white">{String.fromCharCode(65 + index)}</span>
                <span className="font-semibold text-slate-100">{option}</span>
                {locked && isChosen && <span className="ml-auto">{correct ? <Check className="text-emerald-300" size={19} /> : <X className="text-rose-300" size={19} />}</span>}
              </button>
            })}
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">{timerEnabled ? <><TinySpinner className="text-indigo-300" /> The clock keeps everyone honest</> : <><Check size={14} className="text-emerald-300" /> Take the time your team needs</>}</p>
        </div>
      </section>
    </div>
  )
}

function OnlineLobbyModal({ room, roomCode, onRoomCodeChange, status, error, inviteUrl, onRandomMatch, onCreateRoom, onCodeMatch, onCopyCode, onCopyInvite, onStart, onClose }) {
  const connected = Boolean(room)
  return (
    <div className="dialog-backdrop fixed inset-0 z-[70] grid place-items-center bg-[#070b1b]/75 p-4 backdrop-blur-md">
      <section className="dialog-surface animate-pop-in w-full max-w-md overflow-hidden rounded-[28px] border border-white/15 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-indigo-300">Live classroom play</p><h2 className="mt-1 text-xl font-black text-white">Find an opponent</h2></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10"><X size={18} /></button></div>
        <div className="p-6">
          {!isSupabaseConfigured ? <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100"><b>One-time deployment step:</b> add the Supabase URL and publishable key from <code>.env.example</code> to your Vercel project, then redeploy.</div> : connected ? <div className="rounded-2xl border border-indigo-300/25 bg-indigo-400/10 p-5 text-center"><Wifi className="mx-auto text-indigo-300" size={24} /><p className="mt-3 text-sm font-bold text-white">{room.room_status === 'waiting' ? 'Invite a classmate to this private room' : 'Opponent connected — ready to play!'}</p>{room.room_status === 'waiting' && <><div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3 shadow-sm"><QRCodeSVG value={inviteUrl} size={136} level="M" includeMargin /></div><p className="mt-3 text-xs text-slate-400">They can scan this QR code, use the invite link, or enter the room code.</p><button onClick={onCopyInvite} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-indigo-200 hover:text-white"><Copy size={14} /> Copy invite link</button></>}<div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Six-character room code</p><div className="mt-2 flex items-center justify-center gap-2"><code className="rounded-xl border border-indigo-300/30 bg-slate-950/50 px-4 py-2 text-xl font-black tracking-[.24em] text-indigo-200">{room.room_code}</code><button onClick={onCopyCode} className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-300/30 px-3 text-xs font-black text-indigo-200 hover:bg-indigo-400/10" aria-label="Copy room code"><Copy size={16} /> Copy code</button></div></div>{room.room_status === 'active' && <button onClick={onStart} disabled={room.seat !== 0} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">{room.seat === 0 ? 'Start game' : 'Waiting for host to start'}</button>}</div> : <><p className="text-sm leading-6 text-slate-400">Get matched with the next available student, create a private room, or join a room with a six-character code.</p><button onClick={onRandomMatch} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 py-3 text-sm font-black text-indigo-950 transition hover:bg-indigo-300"><UsersRound size={17} /> Find a random opponent</button><button onClick={onCreateRoom} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/35 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/20"><Copy size={17} /> Create private room</button><div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[.16em] text-slate-500"><span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" /></div><div className="flex gap-2"><input value={roomCode} maxLength="6" onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ROOM CODE" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-center text-sm font-black tracking-[.16em] text-white outline-none placeholder:text-slate-600 focus:border-indigo-300" /><button onClick={onCodeMatch} disabled={roomCode.length !== 6} className="rounded-xl border border-indigo-300/30 px-4 text-sm font-black text-indigo-200 transition hover:bg-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-40">Join</button></div></>}
          {status && <p className="mt-4 text-center text-xs font-semibold text-indigo-300">{status}</p>}
          {error && <p className="mt-3 rounded-lg bg-rose-400/10 px-3 py-2 text-center text-xs text-rose-300">{error}</p>}
        </div>
      </section>
    </div>
  )
}

function SettingsModal({ theme, onThemeChange, timerEnabled, onTimerEnabledChange, timerDuration, onTimerDurationChange, winRules, onRulesChange, teamNames, onTeamNamesChange, onClose }) {
  const ruleOptions = [
    { id: 'horizontal', label: 'Horizontal', helper: 'Across a row', glyph: '—' },
    { id: 'vertical', label: 'Vertical', helper: 'Up a column', glyph: '│' },
    { id: 'diagonalDown', label: 'Diagonal ↘', helper: 'Top-left to bottom-right', glyph: '╲' },
    { id: 'diagonalUp', label: 'Diagonal ↗', helper: 'Bottom-left to top-right', glyph: '╱' },
  ]
  const toggleRule = (id) => {
    const enabled = Object.values(winRules).filter(Boolean).length
    if (winRules[id] && enabled === 1) return
    onRulesChange({ ...winRules, [id]: !winRules[id] })
  }

  return (
    <div className="dialog-backdrop fixed inset-0 z-[60] grid place-items-center bg-[#070b1b]/70 p-4 backdrop-blur-md">
      <section className="settings-surface animate-pop-in flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-slate-900 shadow-2xl sm:max-w-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-indigo-300">Match controls</p><h2 className="mt-1 text-xl font-black text-white">Game settings</h2></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/10" aria-label="Close settings"><X size={18} /></button>
        </div>
        <div className="min-h-0 space-y-6 overflow-y-auto p-6">
          <div>
            <div className="flex items-center justify-between"><div><p className="font-bold text-white">Appearance</p><p className="mt-0.5 text-xs text-slate-400">Use the color scheme that suits the room.</p></div></div>
            <div className="mt-3 grid grid-cols-2 rounded-xl border border-white/10 bg-slate-950/35 p-1">
              <button onClick={() => onThemeChange('dark')} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black transition ${theme === 'dark' ? 'bg-indigo-400 text-indigo-950' : 'text-slate-400 hover:text-white'}`}><Moon size={15} /> Dark</button>
              <button onClick={() => onThemeChange('light')} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black transition ${theme === 'light' ? 'bg-amber-300 text-amber-950' : 'text-slate-400 hover:text-white'}`}><Sun size={15} /> Light</button>
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-4"><div><p className="font-bold text-white">Question timer</p><p className="mt-0.5 text-xs text-slate-400">The same limit applies to a steal attempt.</p></div><button onClick={() => onTimerEnabledChange(!timerEnabled)} className={`relative h-7 w-12 rounded-full transition ${timerEnabled ? 'bg-indigo-400' : 'bg-slate-700'}`} aria-pressed={timerEnabled} aria-label="Toggle question timer"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${timerEnabled ? 'left-6' : 'left-1'}`} /></button></div>
            <div className={`mt-4 flex items-center gap-3 ${timerEnabled ? '' : 'opacity-40'}`}><input type="number" min="1" step="1" value={timerDuration} disabled={!timerEnabled} onChange={(event) => onTimerDurationChange(Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm font-black text-white outline-none focus:border-indigo-300 disabled:cursor-not-allowed" /><span className="rounded-lg bg-white/[.06] px-3 py-2.5 text-xs font-black text-slate-300">seconds</span></div>
            <p className="mt-2 text-[10px] text-slate-500">Displays as {formatTime(timerDuration)}. Timer changes start with the next question.</p>
          </div>

          <div className="border-t border-white/10 pt-5">
            <div><p className="font-bold text-white">Winning lines</p><p className="mt-0.5 text-xs text-slate-400">Choose the directions that count as a four-in-a-row win.</p></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ruleOptions.map((rule) => <button key={rule.id} onClick={() => toggleRule(rule.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${winRules[rule.id] ? 'border-indigo-300/50 bg-indigo-400/10' : 'border-white/10 bg-white/[.025] opacity-50'}`}><span className={`grid h-8 w-8 place-items-center rounded-lg text-xl font-black ${winRules[rule.id] ? 'bg-indigo-400 text-indigo-950' : 'bg-slate-800 text-slate-400'}`}>{rule.glyph}</span><span><span className="block text-xs font-black text-white">{rule.label}</span><span className="block text-[10px] text-slate-400">{rule.helper}</span></span></button>)}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">At least one winning direction must remain on.</p>
          </div>

          <div className="border-t border-white/10 pt-5">
            <div><p className="font-bold text-white">Team names</p><p className="mt-0.5 text-xs text-slate-400">Edit the names shown throughout this match.</p></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-black uppercase tracking-[.13em] text-rose-300">Crimson team<input value={teamNames[0]} maxLength="32" onChange={(event) => onTeamNamesChange([event.target.value, teamNames[1]])} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-rose-300" /></label>
              <label className="text-[10px] font-black uppercase tracking-[.13em] text-amber-200">Gold team<input value={teamNames[1]} maxLength="32" onChange={(event) => onTeamNamesChange([teamNames[0], event.target.value])} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-amber-300" /></label>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function ResultModal({ result, team, onContinue, onRestart }) {
  const won = result?.type === 'win'
  return (
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-[#070b1b]/85 p-4 backdrop-blur-lg">
      <section className="dialog-surface animate-pop-in w-full max-w-md overflow-hidden rounded-[30px] border border-white/15 bg-slate-900 text-center shadow-2xl">
        <div className={`h-2 ${won ? team.disc : 'bg-indigo-400'}`} />
        <div className="p-8">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl ${won ? `${team.disc} ${team.glow}` : 'bg-indigo-500'} text-slate-950`}>
            {won ? <Trophy size={42} strokeWidth={2.4} /> : <Gamepad2 size={42} />}
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-indigo-300">{won ? 'Four in a row!' : 'Board full'}</p>
          <h2 className="mt-2 text-3xl font-black text-white">{won ? `${team.name} wins!` : 'A spectacular tie.'}</h2>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-400">{won ? 'Brains, timing, and a brilliant final drop.' : 'Neither team gave an inch. Run it back?'}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button onClick={onRestart} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10"><RotateCcw size={16} /> New match</button>
            <button onClick={onContinue} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 py-3 text-sm font-black text-indigo-950 transition hover:bg-indigo-300">Play again <ArrowRight size={16} /></button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const [isAppLoading, setIsAppLoading] = useState(true)
  const [board, setBoard] = useState(emptyBoard)
  const [activeTeam, setActiveTeam] = useState(0)
  const [phase, setPhase] = useState('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionBank, setQuestionBank] = useState([])
  const [usedQuestions, setUsedQuestions] = useState([])
  const [deckUrl, setDeckUrl] = useState('')
  const [deckStatus, setDeckStatus] = useState('')
  const [deckTitle, setDeckTitle] = useState('No deck loaded yet')
  const [teamNames, setTeamNames] = useState(teams.map((team) => team.name))
  const [onlineLobbyOpen, setOnlineLobbyOpen] = useState(false)
  const [onlineRoom, setOnlineRoom] = useState(null)
  const [onlineRoomCode, setOnlineRoomCode] = useState('')
  const [onlineStatus, setOnlineStatus] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [theme, setTheme] = useState('light')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [timerDuration, setTimerDuration] = useState(20)
  const [winRules, setWinRules] = useState({ horizontal: true, vertical: true, diagonalDown: true, diagonalUp: true })
  const [seconds, setSeconds] = useState(20)
  const [isSteal, setIsSteal] = useState(false)
  const [canDrop, setCanDrop] = useState(false)
  const [lastDrop, setLastDrop] = useState(null)
  const [winner, setWinner] = useState(null)
  const [score, setScore] = useState([0, 0])
  const [message, setMessage] = useState('Answer a question to unlock your move.')
  const timerRef = useRef(null)
  const applyingRemoteState = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setIsAppLoading(false), 1100)
    return () => window.clearTimeout(timer)
  }, [])

  const showButtonSpinner = (event) => {
    const button = event.target.closest?.('button')
    if (!button || button.disabled || button.dataset.pressLoading === 'true') return
    button.dataset.pressLoading = 'true'
    button.setAttribute('aria-busy', 'true')
    window.setTimeout(() => {
      delete button.dataset.pressLoading
      button.removeAttribute('aria-busy')
    }, 600)
  }

  const gameTeams = teams.map((item, index) => ({ ...item, name: teamNames[index].trim() || `Team ${index + 1}` }))
  const question = questionBank.length ? questionBank[questionIndex % questionBank.length] : null
  const team = gameTeams[activeTeam]
  const availableColumns = useMemo(() => Array.from({ length: COLS }, (_, col) => getOpenRow(board, col) !== -1), [board])
  const isMyTurn = !onlineRoom || (onlineRoom.room_status === 'active' && onlineRoom.seat === activeTeam)

  const snapshotGame = () => ({
    board, activeTeam, phase, questionIndex, questionBank, usedQuestions, teamNames,
    timerEnabled, timerDuration, seconds, isSteal, canDrop, lastDrop, winner, score, message,
    winRules,
  })

  const applyRemoteGame = (state) => {
    if (!state || !Array.isArray(state.board)) return
    applyingRemoteState.current = true
    setBoard(state.board)
    setActiveTeam(state.activeTeam ?? 0)
    setPhase(state.phase ?? 'intro')
    setQuestionIndex(state.questionIndex ?? 0)
    setQuestionBank(state.questionBank?.length ? state.questionBank : [])
    setUsedQuestions(state.usedQuestions || [])
    setTeamNames(state.teamNames?.length === 2 ? state.teamNames : teams.map((item) => item.name))
    setTimerEnabled(state.timerEnabled ?? true)
    setTimerDuration(state.timerDuration ?? 20)
    setSeconds(state.seconds ?? 20)
    setIsSteal(state.isSteal ?? false)
    setCanDrop(state.canDrop ?? false)
    setLastDrop(state.lastDrop ?? null)
    setWinner(state.winner ?? null)
    setScore(state.score ?? [0, 0])
    setMessage(state.message || 'Connected to a live game.')
    setWinRules(state.winRules || { horizontal: true, vertical: true, diagonalDown: true, diagonalUp: true })
  }

  const connectOnline = async (code, mode = 'random') => {
    setOnlineError('')
    setOnlineStatus('Connecting you to a game…')
    try {
      const room = await joinMatch({ roomCode: code, mode, initialState: snapshotGame() })
      setOnlineRoom(room)
      setOnlineStatus(room.room_status === 'waiting' ? 'Room created. Share the code or wait for a random match.' : 'Match found. You are connected live.')
      if (room.game_state?.board) applyRemoteGame(room.game_state)
    } catch (error) {
      setOnlineStatus('')
      setOnlineError(error.message || 'Unable to connect to a game.')
    }
  }

  const copyText = async (text) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (!copied) throw new Error('Copy was blocked by this browser.')
    }
  }

  const copyRoomCode = async () => {
    if (!onlineRoom?.room_code) return
    try {
      await copyText(onlineRoom.room_code)
      setOnlineStatus(`Room code ${onlineRoom.room_code} copied.`)
    } catch (error) {
      setOnlineError(error.message || `Copy was blocked. Share this code: ${onlineRoom.room_code}`)
    }
  }

  const copyInviteLink = async () => {
    if (!onlineRoom?.room_code) return
    const inviteUrl = `${window.location.origin}${window.location.pathname}?join=${onlineRoom.room_code}`
    try {
      await copyText(inviteUrl)
      setOnlineStatus('Invite link copied. Your classmate can open it or scan the QR code.')
    } catch (error) {
      setOnlineError(error.message || `Copy was blocked. Share this code: ${onlineRoom.room_code}`)
    }
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join')
    if (code && /^[A-Z0-9]{6}$/i.test(code)) {
      setOnlineRoomCode(code.toUpperCase())
      setOnlineLobbyOpen(true)
    }
  }, [])

  const beginQuestion = (teamIndex, steal = false) => {
    setActiveTeam(teamIndex)
    setIsSteal(steal)
    setSeconds(timerDuration)
    setPhase('question')
    setCanDrop(false)
  }

  const startGame = async () => {
    if (onlineRoom?.room_status === 'waiting') {
      setMessage('Waiting for another student to join your room.')
      return
    }
    if (!isMyTurn) return
    const initialBoard = emptyBoard()
    const startMessage = questionBank.length
      ? `${gameTeams[0].name} open the game. Select a question tile to begin.`
      : 'Import a Google Slides deck from the panel to begin the quiz.'
    const startedGame = {
      ...snapshotGame(), board: initialBoard, activeTeam: 0, questionIndex: 0,
      canDrop: false, winner: null, lastDrop: null, usedQuestions: [], phase: 'board', message: startMessage,
    }
    setBoard(initialBoard)
    setActiveTeam(0)
    setQuestionIndex(0)
    setCanDrop(false)
    setWinner(null)
    setLastDrop(null)
    setUsedQuestions([])
    setPhase('board')
    setMessage(startMessage)
    if (onlineRoom?.room_id) {
      try {
        await saveMatchState(onlineRoom.room_id, startedGame)
        setOnlineStatus('Game started — your opponent is being brought to the board.')
      } catch (error) {
        setOnlineError(error.message || 'The game could not be started for both players.')
      }
    }
  }

  const restartMatch = () => {
    setBoard(emptyBoard())
    setActiveTeam(0)
    setQuestionIndex((index) => index + 1)
    setCanDrop(false)
    setWinner(null)
    setPhase('intro')
    setMessage('A fresh board is ready.')
  }

  const importDeck = async () => {
    if (!deckUrl.trim()) {
      setDeckStatus('Paste a Google Slides sharing link first.')
      return
    }
    setDeckStatus('Reading your public deck…')
    try {
      const response = await fetch(`/api/slides?url=${encodeURIComponent(deckUrl.trim())}`)
      const body = await response.text()
      let data
      try {
        data = JSON.parse(body)
      } catch {
        throw new Error('Slide importing needs the Vercel serverless endpoint. Locally, run “vercel dev”; on the deployed site, refresh after redeploying.')
      }
      if (!response.ok) throw new Error(data.error || 'Could not read that deck.')
      if (!data.slides?.length) throw new Error('No usable question slides were found.')
      setQuestionBank(data.slides)
      setQuestionIndex(0)
      setUsedQuestions([])
      setDeckTitle(data.title || 'Google Slides quiz')
      setDeckStatus(`${data.slides.length} question slides ready.`)
    } catch (error) {
      setDeckStatus(error.message || 'Could not import the deck.')
    }
  }

  const selectQuestion = (index) => {
    if (usedQuestions.includes(index) || phase === 'question' || canDrop || !isMyTurn) return
    setQuestionIndex(index)
    beginQuestion(activeTeam, false)
  }

  useEffect(() => {
    if (phase !== 'question' || !timerEnabled || !isMyTurn) return undefined
    timerRef.current = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timerRef.current)
          window.setTimeout(() => handleAnswer(false, true), 0)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timerRef.current)
  }, [phase, isSteal, questionIndex, timerEnabled, isMyTurn])

  useEffect(() => {
    if (!onlineRoom?.room_id) return undefined
    return watchMatch(onlineRoom.room_id, (room) => {
      setOnlineRoom((current) => current ? { ...current, room_status: room.status } : current)
      applyRemoteGame(room.game_state)
    }, (status, error) => {
      if (status === 'SUBSCRIBED') setOnlineStatus('Live connection ready.')
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setOnlineError(error?.message || `Realtime connection ${status.toLowerCase()}.`)
    })
  }, [onlineRoom?.room_id])

  useEffect(() => {
    if (onlineRoom?.room_status === 'active' && phase !== 'intro') setOnlineLobbyOpen(false)
  }, [onlineRoom?.room_status, phase])

  useEffect(() => {
    if (!onlineRoom?.room_id || onlineRoom.room_status !== 'active') return undefined
    if (applyingRemoteState.current) {
      applyingRemoteState.current = false
      return undefined
    }
    const timer = window.setTimeout(() => {
      saveMatchState(onlineRoom.room_id, snapshotGame()).catch((error) => setOnlineError(error.message || 'Could not sync the game.'))
    }, 150)
    return () => window.clearTimeout(timer)
  }, [board, activeTeam, phase, questionIndex, questionBank, usedQuestions, teamNames, timerEnabled, timerDuration, seconds, isSteal, canDrop, lastDrop, winner, score, message, winRules, onlineRoom?.room_id, onlineRoom?.room_status])

  const handleAnswer = (correct, timedOut = false) => {
    if (!isMyTurn) return
    window.clearInterval(timerRef.current)
    setUsedQuestions((current) => current.includes(questionIndex) ? current : [...current, questionIndex])
    if (correct) {
      setPhase('board')
      setCanDrop(true)
      setMessage(isSteal ? `${team.name} stole the move! Choose any open column.` : `Correct! ${team.name}, drop your disc.`)
      return
    }
    if (!isSteal) {
      const stealingTeam = activeTeam === 0 ? 1 : 0
      setQuestionIndex((index) => index + 1)
      setMessage(timedOut ? `${team.name} ran out of time. ${gameTeams[stealingTeam].name}, take the steal.` : `${team.name} missed it. ${gameTeams[stealingTeam].name}, steal the move!`)
      window.setTimeout(() => beginQuestion(stealingTeam, true), 350)
      return
    }
    const nextTeam = activeTeam === 0 ? 1 : 0
    setQuestionIndex((index) => index + 1)
    setMessage(timedOut ? 'Steal window expired. The turn moves on.' : 'Steal missed. The turn moves on.')
    window.setTimeout(() => beginQuestion(nextTeam, false), 350)
  }

  const dropDisc = (col) => {
    if (!canDrop || !availableColumns[col] || !isMyTurn) return
    const row = getOpenRow(board, col)
    const updated = board.map((line) => [...line])
    updated[row][col] = team.id
    setBoard(updated)
    setLastDrop({ row, col, id: team.id })
    setCanDrop(false)

    const victory = getWinner(updated, winRules)
    if (victory) {
      setWinner({ type: 'win', teamIndex: activeTeam, line: victory.line })
      setScore((current) => current.map((points, index) => index === activeTeam ? points + 1 : points))
      window.setTimeout(() => setPhase('complete'), 550)
      return
    }
    if (updated.every((line) => line.every(Boolean))) {
      setWinner({ type: 'tie' })
      window.setTimeout(() => setPhase('complete'), 550)
      return
    }
    const nextTeam = activeTeam === 0 ? 1 : 0
    setQuestionIndex((index) => index + 1)
    setActiveTeam(nextTeam)
    setPhase('board')
    setMessage(`${team.name} placed a disc. ${gameTeams[nextTeam].name}, select the next question.`)
  }

  const winningCells = new Set((winner?.line || []).map(([row, col]) => `${row}-${col}`))

  return (
    <main onClickCapture={showButtonSpinner} className={`aurora-bg board-grid min-h-screen overflow-x-hidden ${theme === 'light' ? 'theme-light' : ''}`}>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-300 to-violet-500 text-indigo-950 shadow-glow"><Gamepad2 size={23} strokeWidth={2.5} /></div>
            <div><h1 className="text-xl font-black tracking-tight text-white">QUIZ<span className="text-indigo-300">FOUR</span></h1><p className="text-[9px] font-bold uppercase tracking-[.22em] text-slate-500">Think fast. Link four.</p></div>
          </div>
          <div className="flex items-center gap-2"><button onClick={() => setOnlineLobbyOpen(true)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${onlineRoom ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[.04] text-slate-300 hover:border-white/25 hover:bg-white/10'}`}><UsersRound size={14} /> {onlineRoom ? 'Online' : 'Play online'}</button><button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-white/25 hover:bg-white/10"><Settings2 size={14} /> Settings</button><button onClick={restartMatch} className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-white/25 hover:bg-white/10 sm:inline-flex"><RotateCcw size={14} /> Reset</button></div>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)_240px] lg:items-center">
          <aside className="order-2 grid grid-cols-2 gap-3 lg:order-1 lg:grid-cols-1">
            {gameTeams.map((item, index) => <TeamCard key={item.id} team={item} score={score[index]} active={activeTeam === index && phase !== 'complete' && phase !== 'intro'} compact />)}
          </aside>

          <section className="order-1 lg:order-2">
            <div className="mb-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 sm:flex-row">
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${canDrop ? team.disc : 'bg-indigo-400'} text-slate-950`}>
                  {canDrop ? <ChevronDown size={20} strokeWidth={3} /> : <Clock3 size={19} strokeWidth={2.5} />}
                </div>
                <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-indigo-300">{canDrop ? 'Move unlocked' : 'Quiz control'}</p><p className="text-sm font-semibold text-slate-200">{message}</p></div>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{timerEnabled ? <Clock3 size={13} className="text-indigo-300" /> : <Sun size={13} className="text-amber-300" />}{timerEnabled ? `${formatTime(timerDuration)} timer` : 'Untimed match'}</div>
            </div>

            <div className="game-board relative rounded-[26px] border border-indigo-300/20 bg-[#182563] p-2 shadow-board sm:p-3">
              <div className="absolute inset-x-3 top-2 z-20 grid grid-cols-7 gap-1 sm:gap-2">{Array.from({ length: COLS }, (_, col) => <button key={col} onClick={() => dropDisc(col)} disabled={!canDrop || !availableColumns[col] || !isMyTurn} aria-label={`Drop in column ${col + 1}`} className={`h-5 rounded-full transition sm:h-7 ${canDrop && availableColumns[col] && isMyTurn ? `${team.disc} cursor-pointer opacity-70 hover:opacity-100` : 'cursor-default bg-white/5'}`} />)}</div>
              <div className="game-grid grid grid-cols-7 gap-1 rounded-[18px] bg-[#111b50] p-1 pt-8 sm:gap-2 sm:p-2 sm:pt-11">
                {board.map((row, rowIndex) => row.map((cell, colIndex) => {
                  const discTeam = gameTeams.find((item) => item.id === cell)
                  const key = `${rowIndex}-${colIndex}`
                  return <button aria-label={`Column ${colIndex + 1}, row ${rowIndex + 1}`} key={key} onClick={() => dropDisc(colIndex)} disabled={!canDrop || !availableColumns[colIndex] || !isMyTurn} className={`game-slot group relative aspect-square overflow-hidden rounded-full bg-[#080e33] shadow-[inset_0_5px_8px_rgba(0,0,0,.4)] transition ${canDrop && availableColumns[colIndex] && isMyTurn ? 'cursor-pointer hover:bg-[#0c174b]' : 'cursor-default'} ${winningCells.has(key) ? 'ring-2 ring-white ring-offset-2 ring-offset-[#182563]' : ''}`}>
                    {cell && <span className={`game-disc absolute inset-[8%] rounded-full ${discTeam.disc} ${discTeam.glow} ${lastDrop?.row === rowIndex && lastDrop?.col === colIndex ? 'animate-drop-disc' : ''} before:absolute before:inset-[16%] before:rounded-full before:bg-white/20`} />}
                    {!cell && canDrop && availableColumns[colIndex] && <span className="absolute inset-[24%] rounded-full bg-white/0 transition group-hover:bg-white/10" />}
                  </button>
                }))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-5 text-[10px] font-bold uppercase tracking-[.13em] text-slate-400"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Crimson</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Gold</span><span className="hidden sm:inline">{Object.values(winRules).filter(Boolean).length} win directions active</span></div>
          </section>

          <aside className="order-3 rounded-2xl border border-white/10 bg-slate-900/55 p-4">
            <div className="flex items-center gap-2"><Flag size={16} className="text-indigo-300" /><h2 className="text-sm font-black text-white">Question deck</h2></div>
            <p className="mt-1 text-[11px] text-slate-500">{deckTitle}</p>
            {!questionBank.length && <p className="mt-3 rounded-xl border border-indigo-300/20 bg-indigo-400/10 px-3 py-2 text-[11px] leading-4 text-indigo-200">Paste a public Google Slides link below to load your question tiles.</p>}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {questionBank.map((item, index) => {
                const completed = usedQuestions.includes(index)
                const current = questionIndex === index && phase === 'question'
                return <button key={`${item.prompt}-${index}`} onClick={() => selectQuestion(index)} disabled={completed || canDrop || phase === 'question'} title={completed ? 'Completed question' : `Choose question ${index + 1}`} className={`relative aspect-square rounded-lg border text-xs font-black transition ${completed ? 'cursor-not-allowed border-white/5 bg-slate-950/70 text-slate-600 line-through' : current ? 'border-indigo-300 bg-indigo-400/20 text-indigo-100' : 'border-white/10 bg-white/[.05] text-slate-200 hover:border-indigo-300/70 hover:bg-indigo-400/10'} disabled:opacity-100`}>
                  {completed ? <Check className="mx-auto text-slate-600" size={15} /> : index + 1}
                </button>
              })}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-400">Pick a tile to show that slide as the current question. Completed tiles grey out automatically.</p>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><TimerReset size={15} className="text-indigo-300" /> Slide source</div>
              <input value={deckUrl} onChange={(event) => setDeckUrl(event.target.value)} placeholder="Paste public Google Slides link" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-indigo-300" />
              <button onClick={importDeck} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-400 px-3 py-2 text-xs font-black text-indigo-950 transition hover:bg-indigo-300"><Sparkles size={14} /> Import deck</button>
              {deckStatus && <p className={`mt-2 text-[10px] ${deckStatus.includes('ready') ? 'text-emerald-300' : 'text-slate-400'}`}>{deckStatus}</p>}
            </div>
          </aside>
        </div>
      </div>

      {phase === 'intro' && <div className="dialog-backdrop fixed inset-0 z-40 grid place-items-center bg-[#070b1b]/75 p-4 backdrop-blur-md"><section className="dialog-surface animate-pop-in w-full max-w-lg overflow-hidden rounded-[30px] border border-white/15 bg-slate-900 p-7 text-center shadow-2xl sm:p-9"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-400 text-indigo-950 shadow-glow"><Crown size={31} /></div><p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-indigo-300">The quiz-powered classic</p><h2 className="mt-2 text-3xl font-black tracking-tight text-white">Ready to link four?</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">Correct answers unlock a move. Get it wrong and the opposing team can steal your chance.</p><div className="mt-6 grid grid-cols-2 gap-3">{gameTeams.map((item) => <TeamCard key={item.id} team={item} active={false} compact />)}</div><button onClick={() => setOnlineLobbyOpen(true)} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/20"><UsersRound size={17} /> Play with another student</button><button onClick={() => setSettingsOpen(true)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-300/30 bg-indigo-400/10 px-5 py-3 text-sm font-black text-indigo-200 transition hover:bg-indigo-400/20"><Settings2 size={17} /> Alter settings</button><button onClick={startGame} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-400 px-5 py-3.5 text-sm font-black text-indigo-950 transition hover:bg-indigo-300">Start the match <ArrowRight size={17} /></button></section></div>}
      {phase === 'question' && question && <QuestionModal key={`${questionIndex}-${activeTeam}-${isSteal}`} team={team} question={question} seconds={seconds} total={timerDuration} timerEnabled={timerEnabled} isSteal={isSteal} canAnswer={isMyTurn} onAnswer={handleAnswer} />}
      {phase === 'complete' && <ResultModal result={winner} team={gameTeams[winner?.teamIndex ?? 0]} onRestart={restartMatch} onContinue={startGame} />}
      {settingsOpen && <SettingsModal theme={theme} onThemeChange={setTheme} timerEnabled={timerEnabled} onTimerEnabledChange={setTimerEnabled} timerDuration={timerDuration} onTimerDurationChange={setTimerDuration} winRules={winRules} onRulesChange={setWinRules} teamNames={teamNames} onTeamNamesChange={setTeamNames} onClose={() => setSettingsOpen(false)} />}
      {onlineLobbyOpen && <OnlineLobbyModal room={onlineRoom} roomCode={onlineRoomCode} onRoomCodeChange={setOnlineRoomCode} status={onlineStatus} error={onlineError} inviteUrl={onlineRoom ? `${window.location.origin}${window.location.pathname}?join=${onlineRoom.room_code}` : window.location.href} onRandomMatch={() => connectOnline('', 'random')} onCreateRoom={() => connectOnline('', 'create')} onCodeMatch={() => connectOnline(onlineRoomCode, 'code')} onCopyCode={copyRoomCode} onCopyInvite={copyInviteLink} onStart={() => { startGame(); setOnlineLobbyOpen(false) }} onClose={() => setOnlineLobbyOpen(false)} />}
      {isAppLoading && <AppPreloader />}
    </main>
  )
}
