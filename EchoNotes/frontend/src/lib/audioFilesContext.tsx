import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { listAudioFiles, type AudioFile } from './audioStorage';
import { supabase } from './supabaseClient';

type ConnectionState = 'connecting' | 'connected' | 'error' | 'disabled';

type AudioFilesContextValue = {
  files: AudioFile[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  currentlyPlayingId: string | null;
  setCurrentlyPlayingId: (id: string | null) => void;
  connectionState: ConnectionState;
};

const AudioFilesContext = createContext<AudioFilesContextValue | undefined>(undefined);

export function AudioFilesProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    supabase ? 'connecting' : 'disabled',
  );
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const data = await listAudioFiles();
      if (mountedRef.current) setFiles(data);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refetch();
    return () => {
      mountedRef.current = false;
    };
  }, [refetch]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const channel = client
      .channel('audio-files-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'audio_files' },
        (payload) => {
          if (!mountedRef.current) return;
          if (payload.eventType === 'INSERT') {
            const row = payload.new as AudioFile;
            setFiles((prev) => {
              if (prev.some((f) => f.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as AudioFile;
            setFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, ...row } : f)));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<AudioFile>;
            if (!oldRow.id) return;
            setFiles((prev) => prev.filter((f) => f.id !== oldRow.id));
          }
        },
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setConnectionState('error');
        }
      });

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  return (
    <AudioFilesContext.Provider
      value={{
        files,
        loading,
        error,
        refetch,
        currentlyPlayingId,
        setCurrentlyPlayingId,
        connectionState,
      }}
    >
      {children}
    </AudioFilesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAudioFiles(): AudioFilesContextValue {
  const ctx = useContext(AudioFilesContext);
  if (!ctx) throw new Error('useAudioFiles must be used inside AudioFilesProvider');
  return ctx;
}
