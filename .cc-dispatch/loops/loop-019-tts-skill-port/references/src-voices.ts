/// Voice alias definitions and resolution.

import { getSecret } from "@evie/lib/secrets";

export interface VoiceProfile {
  voiceId: string | (() => Promise<string>);
  model: string;
  stability: number;
  similarity: number;
  style: number;
  speakerBoost: boolean;
  speed: number;
}

const DEFAULTS = {
  model: "eleven_turbo_v2",
  stability: 0.80,
  similarity: 0.61,
  style: 0.70,
  speakerBoost: true,
  speed: 1.2,
};

const VOICE_ALIASES: Record<string, VoiceProfile> = {
  cedric: {
    voiceId: async () =>
      getSecret({
        op: "op://Openclaw/EVIE - Elevenlabs Voice ID - Cedric/password",
        env: "ELEVENLABS_VOICE_ID_CEDRIC",
      }),
    ...DEFAULTS,
  },
  evie: {
    voiceId: "0z8S749Xe6jLCD34QXl1",
    ...DEFAULTS,
  },
};

let _resolvedIds = new Map<string, string>();

export async function resolveVoice(
  nameOrId: string,
): Promise<{ voiceId: string; profile: VoiceProfile }> {
  const alias = VOICE_ALIASES[nameOrId.toLowerCase()];
  if (!alias) {
    // Treat as raw voice ID
    return {
      voiceId: nameOrId,
      profile: { voiceId: nameOrId, ...DEFAULTS },
    };
  }

  let voiceId: string;
  if (typeof alias.voiceId === "function") {
    const cached = _resolvedIds.get(nameOrId.toLowerCase());
    if (cached) {
      voiceId = cached;
    } else {
      voiceId = await alias.voiceId();
      _resolvedIds.set(nameOrId.toLowerCase(), voiceId);
    }
  } else {
    voiceId = alias.voiceId;
  }

  return { voiceId, profile: alias };
}

export function isKnownAlias(name: string): boolean {
  return name.toLowerCase() in VOICE_ALIASES;
}

export function listAliases(): string[] {
  return Object.keys(VOICE_ALIASES);
}
