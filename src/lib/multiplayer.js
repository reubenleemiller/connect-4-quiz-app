import { isSupabaseConfigured, supabase } from './supabase'

async function ensureAnonymousPlayer() {
  if (!supabase) throw new Error('Online play is not configured yet.')
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

export async function joinMatch({ roomCode, mode = 'random', initialState }) {
  await ensureAnonymousPlayer()
  const { data, error } = await supabase.rpc('create_or_join_game', {
    p_room_code: roomCode?.trim().toUpperCase() || null,
    p_match_mode: mode,
    p_initial_state: initialState,
  })
  if (error) throw error
  return data[0]
}

export async function createTeacherClassroom({ title, deckState, pairing, protectDeck }) {
  await ensureAnonymousPlayer()
  const { data, error } = await supabase.rpc('create_teacher_classroom', {
    p_title: title,
    p_deck_state: deckState,
    p_pairing: pairing,
    p_protect_deck: protectDeck,
  })
  if (error) throw error
  return data[0]
}

export async function getTeacherClassroom(classCode) {
  await ensureAnonymousPlayer()
  const { data, error } = await supabase.rpc('get_teacher_classroom', {
    p_class_code: classCode.trim().toUpperCase(),
  })
  if (error) throw error
  return data[0]
}

export async function joinTeacherMatch({ classCode, roomCode, mode = 'random', initialState }) {
  await ensureAnonymousPlayer()
  const { data, error } = await supabase.rpc('create_or_join_teacher_game', {
    p_class_code: classCode.trim().toUpperCase(),
    p_room_code: roomCode?.trim().toUpperCase() || null,
    p_match_mode: mode,
    p_initial_state: initialState,
  })
  if (error) throw error
  return data[0]
}

export async function saveMatchState(roomId, gameState) {
  const { error } = await supabase.rpc('submit_game_state', {
    p_room_id: roomId,
    p_game_state: gameState,
  })
  if (error) throw error
}

export function watchMatch(roomId, onUpdate, onStatus) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`quiz-four-room-${roomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'game_rooms',
      filter: `id=eq.${roomId}`,
    }, ({ new: room }) => onUpdate(room))
    .subscribe((status, error) => onStatus?.(status, error))

  return () => supabase.removeChannel(channel)
}

export { isSupabaseConfigured }
