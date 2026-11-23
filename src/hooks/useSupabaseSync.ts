import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useApp } from '../store/AppStore';
import { supabaseSync } from '../lib/supabaseSync';

export function useSupabaseAutoSync(): void {
  const { state, actions } = useApp();
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    supabaseSync.attach({
      getState: () => stateRef.current,
      applyRemote: (next) => actions.replaceState(next),
    });
    void supabaseSync.init();
    return () => supabaseSync.detach();
  }, [actions]);

  useEffect(() => {
    supabaseSync.queuePush(state);
  }, [state]);
}

export function useSupabaseSnapshot() {
  useEffect(() => {
    void supabaseSync.init();
  }, []);
  return useSyncExternalStore(
    supabaseSync.subscribe,
    supabaseSync.getSnapshot,
    supabaseSync.getSnapshot,
  );
}