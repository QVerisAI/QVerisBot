declare module "@discordjs/voice" {
  import type { Readable } from "node:stream";

  export const AudioPlayerStatus: {
    Playing: "playing";
    Idle: "idle";
  };

  export const EndBehaviorType: {
    AfterSilence: "after_silence";
  };

  export const VoiceConnectionStatus: {
    Ready: "ready";
    Disconnected: "disconnected";
    Signalling: "signalling";
    Connecting: "connecting";
    Destroyed: "destroyed";
  };

  export type AudioPlayer = {
    state: { status: string };
    play: (resource: unknown) => void;
    stop: (force?: boolean) => void;
    on: (event: "error", listener: (error: unknown) => void) => void;
  };

  export type VoiceConnection = {
    receiver: {
      speaking: {
        on: (event: "start", listener: (userId: string) => void) => void;
      };
      subscribe: (
        userId: string,
        options?: {
          end?: {
            behavior: string;
            duration: number;
          };
        },
      ) => Readable;
    };
    subscribe: (player: AudioPlayer) => void;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    destroy: () => void;
  };

  export function createAudioPlayer(): AudioPlayer;
  export function createAudioResource(input: string): unknown;
  export function entersState<T>(target: T, status: string, timeout: number): Promise<T>;
  export function joinVoiceChannel(options: {
    channelId: string;
    guildId: string;
    adapterCreator: unknown;
    selfDeaf?: boolean;
    selfMute?: boolean;
  }): VoiceConnection;
}
