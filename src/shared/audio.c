#include "audio.h"
#include "private.h"
#include "tm4/fixed.h"
#include "tm4/main/math3d.h"
#include "tm4/main/sound.h"
#include "tm4/main/system.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int Tm3LoadSound(s32 id)
{
    char name[24], path[40];
    snprintf(name, sizeof(name), "tm3_s%02d", id);
    SoundVagAttr attr;
    s32 program = SoundGetProgramId(name);
    if (program >= 0)
        return SoundProgramIdGetVagAttr(program, 0, &attr);
    snprintf(path, sizeof(path), "/resourcePacks/tm3/soundBanks/%d", id);
    RegistryDirectory* directory = RegGetDirectoryPtrS(path);
    const void* data = directory ? RegGetFileDataPS(directory, "data") : NULL;
    const u32* size = directory ? RegGetFileDataPS(directory, "size") : NULL;
    if (!data || !size || *size < 32 || *size > 1024 * 1024)
        return 0;
    void* copy = malloc(*size);
    if (!copy)
        return 0;
    memcpy(copy, data, *size);
    SoundConstructor(copy);
    free(copy);
    program = SoundGetProgramId(name);
    return program >= 0 && SoundProgramIdGetVagAttr(program, 0, &attr);
}
void Tm3PlayVoice(
    char* name, const SVECTOR* position, void* owner, s32 pitch, s32 random_pitch, s32 volume)
{
    if (random_pitch)
        pitch = pitch - 128 + randrand() % 256;
    SoundEmitter* emitter = owner
        ? ObjectCreate("soundEmitter", OBJECT_FOLLOW_OWNER, owner, name, 0)
        : position ? ObjectCreate("soundEmitter", 0, name, SOUND_EMITTER_POSITION, position->vx,
                         position->vy, position->vz)
                   : ObjectCreate("soundEmitter", 0, name, 0);
    if (!emitter)
        return;
    if (pitch <= 0)
        pitch = 4096;
    for (s32 i = 0; i < emitter->voice_count; ++i) {
        SoundVagAttr attr;
        SoundEmitterVoice* voice = &emitter->voices[i];
        voice->volume = voice->volume_base = voice->volume_base * volume / 256;
        voice->pitch = voice->pitch_base = pitch;
        if (SoundProgramIdGetVagAttr(emitter->program_id, i, &attr) == 1 && !attr.loop)
            voice->duration_frames = Q12MulRound(attr.sample_size_8bytes * 5326 / pitch, 30);
    }
}
void Tm3PlayNamedSound(
    char* name, const SVECTOR* position, void* owner, s32 pitch, s32 random_pitch)
{
    Tm3PlayVoice(name, position, owner, pitch, random_pitch, 256);
}
void Tm3PlayLaserSound(void* beam)
{
    /* Class 20, flags 13 then 0. Global VAB tone 14 has centre note 84,
       which SoundLoadVab (80040adc) maps to pitch 0x51c. */
    Tm3PlayVoice("tm3_s14", NULL, beam, 1180, 0, 160);
    Tm3PlayVoice("tm3_s14", NULL, NULL, 0x51c, 0, 256);
}

/* Contact at 800213a8 uses speed * 8 gain. A suspension hit at 80021d20
   requires two wheels and cannot interrupt the same car's active landing voice. */
static void contact_sound(Car* car, s32 speed)
{
    Tm3PlayVoice("tm3_s23", NULL, car, 1308, 1, speed * 8);
}

static int landing_sound(Car* car)
{
    if (SoundPlaying(car, "tm3_s24"))
        return 0;
    Tm3PlayVoice("tm3_s24", NULL, car, 1308, 1, 256);
    return 1;
}

const WebWorldContactEffects Tm3ContactEffects = { 24, 2, contact_sound, landing_sound };

void Tm3TeleportEffect(Car* car)
{
    Tm3PlayNamedSound("tm3_s11", NULL, car, 1600, 0);
}

void Tm3PlaySound(s32 id, const SVECTOR* position, s32 pitch, s32 random_pitch)
{
    char name[24];
    snprintf(name, sizeof(name), "tm3_s%02d", id);
    Tm3PlayNamedSound(name, position, NULL, pitch, random_pitch);
}
