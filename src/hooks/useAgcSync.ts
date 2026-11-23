import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useApp } from '../store/AppStore';
import { agcSync } from '../lib/agcSync';

export function useAgcAutoSync(): void {
  const { state, actions } = useApp();
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    agcSync.attach({
      getState: () => stateRef.current,
      applyRemote: (next) => actions.replaceState(next),
    });
    void agcSync.init();
    return () => agcSync.detach();
  }, [actions]);

  useEffect(() => {
    agcSync.queuePush(state);
  }, [state]);
}

export function useAgcSnapshot() {
  useEffect(() => {
    void agcSync.init();
  }, []);
  return useSyncExternalStore(
    agcSync.subscribe,
    agcSync.getSnapshot,
    agcSync.getSnapshot,
  );
}