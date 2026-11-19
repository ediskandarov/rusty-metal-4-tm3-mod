#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/main/sound.h"

void Tm3CarEngineProcess(Car* car, const Tm3EngineSettings* settings)
{
    SoundEmitter* emitter = car->engine_sound;
    if (!emitter)
        return;
    /* TM3 CarProcess (80018a3c): wheel-derived revs drive absolute pitch and volume. */
    s32 pitch = (u16)(settings->pitch_base + Q12MulRound(car->force_sum, settings->pitch_gain));
    s32 volume = (u16)(settings->volume_base + Q12MulRound(car->force_sum, settings->volume_gain));
    for (s32 i = 0; i < emitter->voice_count; ++i) {
        SoundEmitterVoice* voice = &emitter->voices[i];
        /* Keep TM4's subsequent scaled-pitch update from replacing the TM3 curve. */
        voice->pitch_mode = SOUND_PITCH_FIXED;
        voice->pitch = voice->pitch_base = pitch;
        /* TM3 uses absolute 0..256 gain, independently of MIDI tone volume. */
        voice->volume = 127 * volume / 256;
    }
}

void Tm3CarTurboProcess(Car* car)
{
    if (!car->controls.turbo_active || car->turbo_fuel <= 0)
        return;
    /* TM3 CarProcess (800185a4) emits at the car origin, without an exhaust mount. */
    SVECTOR origin = { car->transform.t[0], car->transform.t[1], car->transform.t[2], 0 };
    Tm3SpawnSprite(2, &origin, 100, NULL, 12, -2);
}
