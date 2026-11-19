#include "assets.h"
#include "audio.h"
#include "effects/private.h"
#include "tm4/main/math3d.h"

#include <STDARG.H>
#include <stdio.h>
#include <stdlib.h>

static char sprite_class[] = "tm3Sprite";
static const u32 sprite_colors[6] = { 0xffffff, 0xffffff, 0x404040, 0xffffff, 0xffffff, 0x404040 };

static s32 sprite_constructor(Tm3Sprite* sprite, va_list arguments)
{
    s32 profile = va_arg(arguments, int);
    const SVECTOR* origin = va_arg(arguments, const SVECTOR*);
    s32 size = va_arg(arguments, int);
    const SVECTOR* velocity = va_arg(arguments, const SVECTOR*);
    s32 fps = va_arg(arguments, int);
    if (profile < 0 || profile >= 6 || size <= 0)
        return 0;
    memset(sprite, 0, sizeof(*sprite));
    sprite->profile = profile;
    sprite->size = size;
    sprite->position = *origin;
    if (profile != 0 && profile != 2 && profile != 4)
        sprite->position.vy -= size / 2;
    sprite->step.vx = q12(136 * (velocity ? velocity->vx : 0));
    sprite->step.vy = q12(136 * (velocity ? velocity->vy : -256));
    sprite->step.vz = q12(136 * (velocity ? velocity->vz : 0));
    sprite->period = 30 / (fps < 1 ? 1 : fps > 30 ? 30 : fps);
    set_position(sprite, &sprite->position);
    return 1;
}
static void sprite_process(Tm3Sprite* sprite)
{
    if (sprite->elapsed >= sprite->period) {
        if (++sprite->frame >= Tm3ReadS16(Tm3SpriteData + sprite->profile * 104)) {
            ObjectDestroy(sprite);
            return;
        }
        sprite->elapsed = 0;
    }
    ++sprite->elapsed;
    sprite->position.vx += sprite->step.vx;
    sprite->position.vy += sprite->step.vy;
    sprite->position.vz += sprite->step.vz;
}
static void sprite_display(
    Tm3Sprite* sprite, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DrawBillboard(sprite->profile, sprite->frame, sprite->size, sprite_colors[sprite->profile],
        &sprite->position, ordering, cursor, limit, view);
}
void Tm3SpawnSurfaceSprite(s32 profile, const SVECTOR* position, s32 size, const SVECTOR* velocity,
    s32 fps, s32 sound, s32 surface)
{
    if (profile < 0 || profile >= 6 || !position || size <= 0 || surface < 0 || surface >= 9)
        return;
    if (!ObjectCreate(sprite_class, 0, profile, position, size, velocity, fps) || sound == -2)
        return;
    /* Class 4's six-by-nine contact table at 8007df80 varies by surface for profile 2. */
    static const s16 profile_pitch[] = { 1000, 1000, 2800, 1400, 1000, 0 };
    static const s8 surface_sample[] = { 6, -1, 24, 16, -1, -1, 6, 6, 6 };
    s32 sample = profile == 2 ? surface_sample[surface] : profile == 3 ? 10 : 0;
    if (sample < 0)
        return;
    s32 pitch = profile == 2 && sample != 6 ? 1400 : profile_pitch[profile];
    char name[16];
    snprintf(name, sizeof(name), "tm3_s%02d", sample);
    Tm3PlayVoice(name, position, NULL, pitch, 1, sound == -1 ? 256 : sound);
}

void Tm3SpawnSprite(
    s32 profile, const SVECTOR* position, s32 size, const SVECTOR* velocity, s32 fps, s32 sound)
{
    Tm3SpawnSurfaceSprite(profile, position, size, velocity, fps, sound, 0);
}

/* 80028c7c draws twice, including on the last update after impact. */
void Tm3SpawnProjectileSmoke(const int16_t position[3])
{
    s32 size = (s16)Tm3ReadS16(Tm3WeaponData + 0x4a);
    Tm3SpawnSmoke(position, size);
}
void Tm3SpawnSmoke(const int16_t position[3], s32 size)
{
    s32 rise = size * 4 > 128 ? size * 4 : 128;
    s32 spread = size / 2 > 32 ? size / 2 : 32;
    SVECTOR velocity = { 0, rand() % (rise / 2) - rise, 0, 0 };
    s32 offset = rand() % spread - spread / 2;
    SVECTOR origin = { position[0] + offset, position[1] + offset / 4, position[2] + offset, 0 };
    Tm3SpawnSprite(5, &origin, size, &velocity, 30, -2);
}

int Tm3SpritesRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass(sprite_class, sizeof(Tm3Sprite), directory,
        (Tm4PackedConstructor)sprite_constructor, NULL, (Tm4ObjectCallback)sprite_process,
        (Tm4ObjectDisplayCallback)sprite_display, NULL);
}
const SnapshotField Tm3SpriteFields[] = {
    SNAP_POD(Tm3Sprite, position.vx),
    SNAP_POD(Tm3Sprite, position.vy),
    SNAP_POD(Tm3Sprite, position.vz),
    SNAP_POD(Tm3Sprite, step.vx),
    SNAP_POD(Tm3Sprite, step.vy),
    SNAP_POD(Tm3Sprite, step.vz),
    SNAP_POD(Tm3Sprite, profile),
    SNAP_POD(Tm3Sprite, frame),
    SNAP_POD(Tm3Sprite, elapsed),
    SNAP_POD(Tm3Sprite, period),
    SNAP_POD(Tm3Sprite, size),
    { 0 },
};
