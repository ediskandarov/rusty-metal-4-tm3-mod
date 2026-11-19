#include "tm3/resources.h"
#include "car_status_effects.h"
#include "checkpoint.h"
#include "decoration.h"
#include "flame.h"
#include "laser.h"
#include "mod_api.h"
#include "module_import.h"
#include "private.h"
#include "prop.h"
#include "remote.h"
#include "snapshot_types.h"
#include "stage.h"
#include "surface.h"
#include "texture_bank.h"
#include "tm3/lightning.h"
#include "tm3/missile.h"
#include "tm4/fixed.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/memory.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/main/render.h"
#include "tm4/main/sound.h"
#include "tm4/main/system.h"
#include "tm4/main/world.h"
#include "world_contact.h"
#include "world_flash.h"
#include "world_pickups.h"
#include "world_weapons.h"
#include <STDARG.H>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

typedef struct {
    SVECTOR position, step;
    s32 profile, frame, elapsed, period, size;
} Tm3Sprite;
typedef struct {
    s32 height, inner_ratio_q12, speed, duration, radial_force, lift, affects_owner, once_per_car;
    s32 age, radius, slow_speed, damage;
    u32 color, color_step;
    s32 hit_serials[16];
    int16_t rotation[3][3], step[3];
    u32 material_offset;
} Tm3Explosion;
typedef struct {
    s32 position[3], velocity[3], spin, angle;
} Tm3DebrisParticle;
typedef struct {
    Tm3DebrisParticle particles[12];
    u32 floor, size, color;
} Tm3Debris;
typedef char Tm3DebrisSizeCheck[sizeof(Tm3Debris) == 396 ? 1 : -1];
static char debris_class[] = "tm3Debris";
static const u8 *sprites, *weapons;
static unsigned bank, references;
static Tm3WeaponGeometry weapon_geometry;
static char sprite_class[] = "tm3Sprite", explosion_class[] = "tm3Explosion";
static const u32 sprite_colors[6] = { 0xffffff, 0xffffff, 0x404040, 0xffffff, 0xffffff, 0x404040 };

static s32 read16(const void* p)
{
    s16 v;
    memcpy(&v, p, 2);
    return v;
}
static u32 read32(const void* p)
{
    u32 v;
    memcpy(&v, p, 4);
    return v;
}
static s32 q12(s32 product)
{
    return (product + 2048) >> 12;
}
static void set_position(void* object, const SVECTOR* p)
{
    ObjectSetPosition(object, p->vx, p->vy, p->vz);
}
static void copy_texture(Tm4CardQuadTexture* texture, const void* source)
{
    memcpy(texture, source, sizeof(*texture));
    texture->uv.tpage |= bank << 9;
}
static void add_force(Car* car, const VECTOR* force)
{
    for (CarParticle* p = car->particles; p < car->particle_end; ++p) {
        p->external_force.vx += force->vx;
        p->external_force.vy += force->vy;
        p->external_force.vz += force->vz;
    }
}

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
static void play_voice(
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
    play_voice(name, position, owner, pitch, random_pitch, 256);
}

static WebWorldFlash* world_flash(void)
{
    WebWorldFlash* f = RegGetFileDataS("/world/screenFlash");
    return f && RegGetFileArraySizeS("/world/screenFlash") == sizeof(*f) ? f : NULL;
}

static void update_flash(WebWorldFlash* f, CVECTOR next)
{
    if (memcmp(&f->current, &next, sizeof(next))) {
        WebCheckpointWorldWrite(&f->current, sizeof(next));
        f->current = next;
    }
}

void Tm3FlashSet(s32 lightning, s32 enabled)
{
    WebWorldFlash* f = world_flash();
    if (f) {
        CVECTOR next = lightning && enabled ? (CVECTOR) { 255, 255, 255, 0 } : f->base;
        next.cd = enabled;
        update_flash(f, next);
    }
}

void Tm3FlashStep(s32 lightning)
{
    WebWorldFlash* f = world_flash();
    if (!f)
        return;
    CVECTOR next = f->current;
    if (lightning) {
        next.cd = (rand() & 3) == 3;
    } else {
        next.r -= next.r > 12 ? 12 : next.r;
        next.g -= next.g > 12 ? 12 : next.g;
        next.b -= next.b > 12 ? 12 : next.b;
    }
    update_flash(f, next);
}

void Tm3PlayLaserSound(void* beam)
{
    /* Class 20, flags 13 then 0. Global VAB tone 14 has centre note 84,
       which SoundLoadVab (80040adc) maps to pitch 0x51c. */
    play_voice("tm3_s14", NULL, beam, 1180, 0, 160);
    play_voice("tm3_s14", NULL, NULL, 0x51c, 0, 256);
}

/* Contact at 800213a8 uses speed * 8 gain. A suspension hit at 80021d20
   requires two wheels and cannot interrupt the same car's active landing voice. */
static void contact_sound(Car* car, s32 speed)
{
    play_voice("tm3_s23", NULL, car, 1308, 1, speed * 8);
}

static int landing_sound(Car* car)
{
    if (SoundPlaying(car, "tm3_s24"))
        return 0;
    play_voice("tm3_s24", NULL, car, 1308, 1, 256);
    return 1;
}

const WebWorldContactEffects Tm3ContactEffects = { 24, 2, contact_sound, landing_sound };

void Tm3TeleportEffect(Car* car)
{
    Tm3PlayNamedSound("tm3_s11", NULL, car, 1600, 0);
}

static void play_sound(s32 id, const SVECTOR* position, s32 pitch, s32 random_pitch)
{
    char name[24];
    snprintf(name, sizeof(name), "tm3_s%02d", id);
    Tm3PlayNamedSound(name, position, NULL, pitch, random_pitch);
}

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
        if (++sprite->frame >= read16(sprites + sprite->profile * 104)) {
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
int Tm3SpriteFrameCount(int id)
{
    return read16(sprites + id * 104);
}
static void draw_billboard(int angle, int depth_bias, int id, int frame, int width, int height,
    u32 color, const SVECTOR* position, Tm4OrderingTag* ordering, u8** cursor, u8* limit,
    MATRIX* view)
{
    const u8* profile = sprites + id * 104;
    if (frame < 0 || frame >= read16(profile))
        return;
    Tm4CardQuadTexture texture;
    copy_texture(&texture, sprites + 628 + read32(profile + 8 + frame * 4));
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    MATRIX billboard;
    VECTOR camera;
    Tm4GteFlag flags;
    RotTrans((SVECTOR*)position, &camera, &flags);
    RotationMatrixY(0, &billboard);
    if (angle)
        RotMatrixZ(angle, &billboard);
    billboard.t[0] = camera.vx;
    billboard.t[1] = camera.vy;
    billboard.t[2] = camera.vz;
    SetRotMatrix(&billboard);
    SetTransMatrix(&billboard);
    s32 x = width / 2, y = height / 2;
    SVECTOR vertices[4] = { { -x, -y, 0, 0 }, { x, -y, 0, 0 }, { -x, y, 0, 0 }, { x, y, 0, 0 } };
    CardDisplayTexturedQuad(
        vertices, color, &texture, ordering, (Tm4CardPacket**)cursor, 1, limit, depth_bias);
    PopMatrix();
}
void Tm3DrawBillboard(int id, int frame, int size, u32 color, const SVECTOR* position,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    draw_billboard(0, 96, id, frame, size, size, color, position, ordering, cursor, limit, view);
}

void Tm3DrawFire(int frame, int width, int height, const SVECTOR* center, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    SVECTOR p = *center;
    p.vy -= height / 2;
    draw_billboard(0, 96, 3, frame, width, height, 0x303030, &p, ordering, cursor, limit, view);
}

void Tm3DrawOutlawEmitter(int angle, int frame, const SVECTOR* position, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    draw_billboard(
        angle, 200, 4, frame, 160, 160, 0x808080, position, ordering, cursor, limit, view);
}

void Tm3DrawOutlawBolt(const MATRIX* transform, const s16 points[][3], int count,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    u32 offset = read32(weapons + 0x188);
    if (offset > weapon_geometry.material_bytes
        || weapon_geometry.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture texture;
    copy_texture(&texture, weapon_geometry.materials + offset);
    MATRIX camera;
    CompMatrix(view, (MATRIX*)transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    for (int i = 1; i < count; ++i) {
        const s16 *a = points[i - 1], *b = points[i];
        SVECTOR vertices[4]
            = { { a[0], a[1], a[2], 0 }, { a[0] + (i == 1 ? 0 : 32), a[1], a[2], 0 },
                  { b[0], b[1], b[2], 0 }, { b[0] + 32, b[1], b[2], 0 } };
        CardDisplayTexturedQuad(
            vertices, 0x808080, &texture, ordering, (Tm4CardPacket**)cursor, 1, limit, 200);
    }
    PopMatrix();
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
    play_voice(name, position, NULL, pitch, 1, sound == -1 ? 256 : sound);
}

void Tm3SpawnSprite(
    s32 profile, const SVECTOR* position, s32 size, const SVECTOR* velocity, s32 fps, s32 sound)
{
    Tm3SpawnSurfaceSprite(profile, position, size, velocity, fps, sound, 0);
}

/* 80028c7c draws twice, including on the last update after impact. */
void Tm3SpawnRoadkillTrail(const int16_t position[3])
{
    s32 size = (s16)read16(weapons + 0x4a);
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

/* TM3 class 5, 80027c90/80027df8: twelve rotating fragments, removed at ground height. */
static s32 debris_constructor(Tm3Debris* debris, va_list arguments)
{
    const SVECTOR* origin = va_arg(arguments, const SVECTOR*);
    memset(debris, 0, sizeof(*debris));
    debris->size = va_arg(arguments, int);
    debris->color = 36;
    debris->floor = (u16)(WorldGetHeight(origin->vx, origin->vz) + 32);
    set_position(debris, origin);
    for (s32 i = 0; i < 12; ++i) {
        Tm3DebrisParticle* particle = &debris->particles[i];
        particle->position[0] = origin->vx;
        particle->position[1] = origin->vy;
        particle->position[2] = origin->vz;
        s32 x = rand(), y = rand(), z = rand();
        x = (s16)((x << 15) | x);
        z = (s16)((z << 15) | z);
        particle->velocity[0] = x * 2;
        particle->velocity[1] = -(s16)y;
        particle->velocity[2] = z * 2;
        particle->spin = z % 16;
    }
    return 1;
}
static void debris_process(Tm3Debris* debris)
{
    s32 active = 0;
    for (s32 i = 0; i < 12; ++i) {
        Tm3DebrisParticle* particle = &debris->particles[i];
        if (particle->position[1] > (s32)debris->floor)
            continue;
        ++active;
        particle->velocity[1] += 1888;
        for (s32 axis = 0; axis < 3; ++axis)
            particle->position[axis] += (particle->velocity[axis] + 512) >> 10;
        particle->angle = (s16)(particle->angle + particle->spin);
    }
    if (!active)
        ObjectDestroy(debris);
}
static void debris_display(
    Tm3Debris* debris, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    if (*cursor + 12 * sizeof(POLY_F3) >= limit)
        return;
    PushMatrix();
    for (s32 i = 0; i < 12; ++i) {
        const Tm3DebrisParticle* particle = &debris->particles[i];
        MATRIX transform, camera;
        RotationMatrixY(particle->angle, &transform);
        RotMatrixZ(particle->angle, &transform);
        for (s32 axis = 0; axis < 3; ++axis)
            transform.t[axis] = particle->position[axis];
        CompMatrix(view, &transform, &camera);
        SetRotMatrix(&camera);
        SetTransMatrix(&camera);
        s32 half = debris->size / 2;
        SVECTOR vertices[3]
            = { { -half, -half, 0, 0 }, { half, -half, 0, 0 }, { -half, half, 0, 0 } };
        int xy[3], perspective, flags;
        s32 depth = RotTransPers3(
            &vertices[0], &vertices[1], &vertices[2], &xy[0], &xy[1], &xy[2], &perspective, &flags);
        if (depth <= 20 || depth >= (s32)otSize)
            continue;
        POLY_F3* packet = (void*)*cursor;
        setPolyF3(packet);
        setRGB0(
            packet, debris->color & 255, (debris->color >> 8) & 255, (debris->color >> 16) & 255);
        setXY3(packet, (s16)xy[0], (s16)(xy[0] >> 16), (s16)xy[1], (s16)(xy[1] >> 16), (s16)xy[2],
            (s16)(xy[2] >> 16));
        GpuLinkPacketSized(ordering + depth, packet, sizeof(*packet));
        *cursor += sizeof(*packet);
    }
    PopMatrix();
}
void Tm3SpawnBurstParticles(const SVECTOR* position)
{
    Tm3SpawnSprite(0, position, 1200, NULL, 12, -1);
    SVECTOR stationary = { 0 };
    Tm3SpawnSprite(1, position, 1200, &stationary, 12, -1);
    Tm3SpawnDebris(position, 32);
}
void Tm3SpawnDebris(const SVECTOR* position, s32 size)
{
    ObjectCreate(debris_class, 0, position, size);
}

static s32 explosion_constructor(Tm3Explosion* explosion, va_list arguments)
{
    const Tm3ExplosionSettings* settings = va_arg(arguments, const Tm3ExplosionSettings*);
    memset(explosion, 0, sizeof(*explosion));
    MATRIX frame;
    if (settings->rotation)
        memcpy(explosion->rotation, settings->rotation->m, sizeof(explosion->rotation));
    else {
        RotationMatrixY(0, &frame);
        memcpy(explosion->rotation, frame.m, sizeof(explosion->rotation));
    }
    memcpy(explosion->step, settings->step, sizeof(explosion->step));
    explosion->material_offset = UINT32_MAX;
    if (settings->material != Tm3Untextured) {
        u32 offset = 0x50;
        if (settings->material == Tm3AxelMaterial)
            offset = 0x1f0;
        if (settings->material == Tm3RemoteMaterial)
            offset = 0x258;
        explosion->material_offset = read32(weapons + offset);
        if (explosion->material_offset > weapon_geometry.material_bytes
            || weapon_geometry.material_bytes - explosion->material_offset
                < sizeof(Tm4CardQuadTexture))
            return 0;
    }
    explosion->height = settings->height < 8 ? 8 : settings->height;
    explosion->inner_ratio_q12 = settings->inner_ratio_q12 < 0 ? 0 : settings->inner_ratio_q12;
    explosion->speed = settings->speed < 32 ? 32 : settings->speed;
    explosion->duration = settings->duration < 1 ? 1 : settings->duration;
    explosion->radial_force = settings->radial_force;
    explosion->lift = settings->lift;
    explosion->affects_owner = settings->affects_owner;
    explosion->once_per_car = settings->once_per_car;
    explosion->slow_speed = explosion->speed / 4 < 16 ? 16 : explosion->speed / 4;
    explosion->damage = (settings->radial_force + settings->lift) / 4;
    explosion->color = settings->color;
    for (s32 shift = 0; shift < 24; shift += 8)
        explosion->color_step |= (((settings->color >> shift) & 255) / explosion->duration)
            << shift;
    set_position(explosion, &settings->position);
    ObjectSetInteractionRadius(explosion, 1);
    play_sound(26, &settings->position, 1200, 1);
    return 1;
}
static void explosion_process(Tm3Explosion* explosion)
{
    explosion->color -= explosion->color_step;
    ++explosion->age;
    explosion->radius
        += explosion->age < explosion->duration / 4 ? explosion->speed : explosion->slow_speed;
    if (explosion->step[0] || explosion->step[1] || explosion->step[2]) {
        const Tm4ShortVectorXYZ* p = &ObjectGetHeader(explosion)->position;
        ObjectSetPosition(explosion, (s16)(p->vx + explosion->step[0]),
            (s16)(p->vy + explosion->step[1]), (s16)(p->vz + explosion->step[2]));
    }
    ObjectSetInteractionRadius(explosion, explosion->radius);
    if (explosion->age > explosion->duration)
        ObjectDestroy(explosion);
}
static s32 falloff(s32 value, s32 distance)
{
    return value - value * distance / 2048;
}
static void explosion_car(void* first, void* second)
{
    Car* car = first;
    Tm3Explosion* explosion = second;
    Car* owner = ObjectGetHeader(explosion)->owner;
    if (!explosion->affects_owner && car == owner)
        return;
    s32 serial = ObjectGetHeader(car)->serial;
    if (explosion->once_per_car) {
        s32 slot = -1;
        for (s32 i = 0; i < 16; ++i) {
            if (explosion->hit_serials[i] == serial)
                return;
            if (!explosion->hit_serials[i])
                slot = i;
        }
        if (slot < 0)
            return;
        explosion->hit_serials[slot] = serial;
    }
    const Tm4ShortVectorXYZ *origin = &ObjectGetHeader(explosion)->position,
                            *p = &ObjectGetHeader(car)->position;
    int32_t delta[3] = { p->vx - origin->vx, p->vy - origin->vy, p->vz - origin->vz };
    int16_t normal[3];
    u32 square = 0;
    for (s32 axis = 0; axis < 3; ++axis) {
        s32 component = (s16)delta[axis];
        square += (u32)(component * component);
    }
    s32 distance = SquareRoot0(square);
    Tm3ProjectileNormalize(delta, normal);
    VECTOR force;
    s32 radial = falloff(explosion->radial_force, distance);
    force.vx = radial * normal[0];
    force.vy = radial * normal[1] - falloff(explosion->lift, distance) * 4096;
    force.vz = radial * normal[2];
    add_force(car, &force);
    WEB_MODULE("car", CarApplyParticipantDamage)
    (car, owner, ObjectGetHeader(explosion)->participant, falloff(explosion->damage, distance),
        NULL, NULL);
}
static void explosion_display(
    Tm3Explosion* explosion, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    const u8* materials = weapon_geometry.materials;
    Tm4CardQuadTexture texture;
    long colors[4] = { explosion->color, explosion->color, explosion->color, explosion->color };
    if (explosion->material_offset != UINT32_MAX)
        copy_texture(&texture, materials + explosion->material_offset);
    MATRIX transform = { 0 }, camera;
    memcpy(transform.m, explosion->rotation, sizeof(transform.m));
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(explosion)->position;
    transform.t[0] = p->vx;
    transform.t[1] = p->vy;
    transform.t[2] = p->vz;
    CompMatrix(view, &transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    s32 outer = explosion->radius, inner = q12(outer * explosion->inner_ratio_q12);
    MATRIX rotation;
    RotationMatrixY(0, &rotation);
    SVECTOR previous_outer = { outer, 0, 0, 0 },
            previous_inner = { inner, -explosion->height, 0, 0 };
    for (s32 i = 1; i <= 32; ++i) {
        RotationMatrixY((i * 128) & 4095, &rotation);
        s32 cosine = rotation.m[0][0], sine = rotation.m[0][2];
        SVECTOR next_outer = { q12(outer * cosine), 0, q12(-outer * sine), 0 };
        SVECTOR next_inner = { q12(inner * cosine), -explosion->height, q12(-inner * sine), 0 };
        SVECTOR vertices[4] = { previous_outer, next_outer, previous_inner, next_inner };
        if (explosion->material_offset == UINT32_MAX)
            CardDisplayGouraudQuad(
                vertices, colors, ordering, (Tm4CardPacket**)cursor, 1, limit, 200);
        else
            CardDisplayTexturedQuad(vertices, explosion->color, &texture, ordering,
                (Tm4CardPacket**)cursor, 1, limit, 200);
        previous_outer = next_outer;
        previous_inner = next_inner;
    }
    PopMatrix();
}
void Tm3SpawnAxelWave(Car* car)
{
    /* TM3 averages the velocities of its final two upper body atoms. TM4
       represents the sprung body with its central particle. */
    const CarParticle* body = car->particle_end - 1;
    int32_t velocity[3] = { body->velocity_q12.vx, body->velocity_q12.vy, body->velocity_q12.vz };
    int16_t forward[3] = { car->transform.m[0][2], car->transform.m[1][2], car->transform.m[2][2] };
    Tm3ExplosionSettings settings = {
        .position = { car->transform.t[0], car->transform.t[1] - 20, car->transform.t[2], 0 },
        .rotation = &car->transform,
        .material = Tm3AxelMaterial,
        .color = 0x808080,
        .height = 40,
        .speed = 200,
        .duration = 15,
        .radial_force = 2048,
        .lift = 1940,
        .owner = car,
        .source = ObjectGetHeader(car)->participant,
        .once_per_car = 1,
    };
    Tm3AxelWaveStep(forward, velocity, settings.step);
    Tm3SpawnExplosion(&settings);
}

void Tm3SpawnExplosion(const Tm3ExplosionSettings* settings)
{
    if (settings->owner)
        ObjectCreateWithParticipant(
            explosion_class, 1, settings->source, settings->owner, settings);
    else
        ObjectCreateWithParticipant(explosion_class, 0, settings->source, settings);
}

/* TM3 80031048: a billboard at the tip and two intersecting quads along the missile. */
void Tm3DrawThumperSegment(MATRIX* transform, int frame, int age, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    if (frame < 0 || frame >= read16(weapons + 0x118))
        return;
    u32 offset = read32(weapons + 0x120 + 4 * frame);
    if (offset > weapon_geometry.material_bytes
        || weapon_geometry.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture texture;
    copy_texture(&texture, weapon_geometry.materials + offset);
    s16 half = (100 + 32 * age) / 2;
    SVECTOR vertices[4]
        = { { -half, -20, 0, 0 }, { half, -20, 0, 0 }, { -half, 20, 0, 0 }, { half, 20, 0, 0 } };
    MATRIX camera;
    CompMatrix(view, transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    CardDisplayTexturedQuad(vertices, 0x404040 - 0x040404 * age, &texture, ordering,
        (Tm4CardPacket**)cursor, 1, limit, 64);
    PopMatrix();
}

void Tm3DisplayEnergyMissile(MATRIX* transform, Tm3EnergyVisual visual, unsigned age,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    u32 offset = read32(weapons + 0x50);
    if (offset > weapon_geometry.material_bytes
        || weapon_geometry.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture front, beam;
    copy_texture(&front, weapon_geometry.materials + offset);
    if (visual == Tm3RainDropVisual) {
        unsigned count = read16(weapons + 0x138);
        if (!count || count > (0x388 - 0x140) / 4)
            return;
        u32 material = read32(weapons + 0x140 + 4 * ((age / 2) % count));
        if (material > weapon_geometry.material_bytes
            || weapon_geometry.material_bytes - material < sizeof(beam))
            return;
        copy_texture(&beam, weapon_geometry.materials + material);
    } else {
        unsigned frame = visual == Tm3NapalmVisual ? (age / 2) % Tm3SpriteFrameCount(3) : 0;
        copy_texture(&beam, sprites + 628 + read32(sprites + 3 * 104 + 8 + 4 * frame));
    }
    const u32 tint = visual != Tm3FreezeVisual ? 0x808080 : 0xa00000;
    s16 w = read16(weapons + 0x4a) / 2, h = read16(weapons + 0x4c) / 2;
    SVECTOR head[4] = { { -w, -h }, { w, -h }, { -w, h }, { w, h } };
    SVECTOR flat[4] = { { -70, 0, -400 }, { 70, 0, -400 }, { -70, 0, 0 }, { 70, 0, 0 } };
    SVECTOR upright[4] = { { 0, 70, -400 }, { 0, -70, -400 }, { 0, 70, 0 }, { 0, -70, 0 } };
    MATRIX camera, billboard;
    CompMatrix(view, transform, &camera);
    RotationMatrixY(0, &billboard);
    memcpy(billboard.t, camera.t, sizeof(billboard.t));
    PushMatrix();
    SetRotMatrix(&billboard);
    SetTransMatrix(&billboard);
    CardDisplayTexturedQuad(head, tint, &front, ordering, (Tm4CardPacket**)cursor, 1, limit, 96);
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    CardDisplayTexturedQuad(flat, tint, &beam, ordering, (Tm4CardPacket**)cursor, 1, limit, 64);
    CardDisplayTexturedQuad(upright, tint, &beam, ordering, (Tm4CardPacket**)cursor, 1, limit, 64);
    PopMatrix();
}

/* 80038234 visits the far half first and tiles the complete UV rectangle on each leaf. */
static void draw_beam_section(const SVECTOR quad[4], const Tm4CardQuadTexture* material,
    Tm4OrderingTag* order, u8** cursor, u8* limit)
{
    VECTOR edge = { quad[0].vx - quad[1].vx, quad[0].vy - quad[1].vy, quad[0].vz - quad[1].vz, 0 };
    if (VectorLength0(&edge) / 2 <= 512) {
        CardDisplayTexturedQuad((SVECTOR*)quad, 0x585858, (Tm4CardQuadTexture*)material, order,
            (Tm4CardPacket**)cursor, 1, limit, 128);
        return;
    }
    SVECTOR far[4], near[4];
    for (int i = 0; i < 4; i += 2) {
        SVECTOR mid = { (quad[i].vx + quad[i + 1].vx) / 2, (quad[i].vy + quad[i + 1].vy) / 2,
            (quad[i].vz + quad[i + 1].vz) / 2, 0 };
        far[i] = near[i + 1] = mid;
        far[i + 1] = quad[i + 1];
        near[i] = quad[i];
    }
    draw_beam_section(far, material, order, cursor, limit);
    draw_beam_section(near, material, order, cursor, limit);
}

void Tm3DrawMapBeam(const SVECTOR* origin, const s16 end[3], const MATRIX* pose,
    Tm4OrderingTag* order, u8** cursor, u8* limit, MATRIX* view)
{
    u32 offset = read32(weapons + 0x328);
    if (offset > weapon_geometry.material_bytes
        || weapon_geometry.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture texture;
    copy_texture(&texture, weapon_geometry.materials + offset);
    SVECTOR quad[4];
    for (int i = 0; i < 2; ++i) {
        SVECTOR local = { i ? 256 : -256, 0, 0, 0 }, width;
        ApplyMatrixSV((MATRIX*)pose, &local, &width);
        quad[2 * i]
            = (SVECTOR) { origin->vx + width.vx, origin->vy + width.vy, origin->vz + width.vz, 0 };
        quad[2 * i + 1] = (SVECTOR) { end[0] + width.vx, end[1] + width.vy, end[2] + width.vz, 0 };
    }
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    draw_beam_section(quad, &texture, order, cursor, limit);
    PopMatrix();
}

void Tm3DisplayWeaponGroup(u32 descriptor, u32 variant, const MATRIX* local_to_world,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DisplayWeaponGeometry(&weapon_geometry, descriptor, variant, bank, -1, local_to_world,
        ordering, cursor, limit, view);
}

void Tm3DisplayClubVortex(const MATRIX* transform, s32 tint, Tm4OrderingTag* ordering, u8** cursor,
    u8* limit, MATRIX* view)
{
    Tm3DisplayWeaponGeometry(
        &weapon_geometry, 0x10, 0, bank, tint, transform, ordering, cursor, limit, view);
}

int Tm3ResourcesAcquire(void)
{
    if (references) {
        ++references;
        return 1;
    }
    RegistryDirectory* directory = RegGetDirectoryPtrS("/resourcePacks/tm3");
    if (!directory)
        return 0;
    sprites = RegGetFileDataPS(directory, "sprites");
    weapons = RegGetFileDataPS(directory, "weapons");
    const u8* bitmap = RegGetFileDataPS(directory, "graphics.bit");
    const u32* weapon_size = RegGetFileDataPS(directory, "weaponsSize");
    if (!sprites || !weapons || !bitmap || !weapon_size
        || !Tm3WeaponGeometryRead(&weapon_geometry, weapons, *weapon_size))
        return 0;
    u16* pixels = calloc(1024 * 512, sizeof(*pixels));
    if (!pixels)
        return 0;
    s32 x = read16(bitmap), y = read16(bitmap + 2), width = read16(bitmap + 4),
        height = read16(bitmap + 6);
    if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > 1024 || y + height > 512) {
        free(pixels);
        return 0;
    }
    for (s32 row = 0; row < height; ++row)
        memcpy(pixels + (y + row) * 1024 + x, bitmap + 8 + row * width * 2, width * 2);
    bank = WebTextureBankCreate(pixels);
    free(pixels);
    if (!bank)
        return 0;
    if (ObjectFindClassIndex(sprite_class) < 0) {
        if (!ObjectRegisterClass(sprite_class, sizeof(Tm3Sprite), directory,
                (Tm4PackedConstructor)sprite_constructor, NULL, (Tm4ObjectCallback)sprite_process,
                (Tm4ObjectDisplayCallback)sprite_display, NULL)
            || !ObjectRegisterClass(explosion_class, sizeof(Tm3Explosion), directory,
                (Tm4PackedConstructor)explosion_constructor, NULL,
                (Tm4ObjectCallback)explosion_process, (Tm4ObjectDisplayCallback)explosion_display,
                NULL)
            || !ObjectRegisterClass(debris_class, sizeof(Tm3Debris), directory,
                (Tm4PackedConstructor)debris_constructor, NULL, (Tm4ObjectCallback)debris_process,
                (Tm4ObjectDisplayCallback)debris_display, NULL)
            || !ObjectRegisterInteractionCallback("car", explosion_class, explosion_car)
            || !Tm3SurfaceRegister(directory) || !Tm3StageRegister(directory)
            || !Tm3FlamesRegister(directory) || !Tm3MissilesRegister(directory)
            || !Tm3LightningRegister(directory)) {
            WebTextureBankDestroy(bank);
            bank = 0;
            return 0;
        }
    }
    // SoundConstructor changes the resource arena; bind every contact sound before tick zero.
    static const u8 contact_samples[] = { 0, 6, 10, 16, 24 };
    for (unsigned i = 0; i < sizeof(contact_samples); ++i)
        if (!Tm3LoadSound(contact_samples[i])) {
            WebTextureBankDestroy(bank);
            bank = 0;
            return 0;
        }
    references = 1;
    return 1;
}
void Tm3ResourcesRelease(void)
{
    if (references && !--references) {
        WebTextureBankDestroy(bank);
        bank = 0;
        sprites = NULL;
        weapons = NULL;
        memset(&weapon_geometry, 0, sizeof(weapon_geometry));
    }
}
static const SnapshotField sprite_fields[] = { SNAP_POD(Tm3Sprite, position.vx),
    SNAP_POD(Tm3Sprite, position.vy), SNAP_POD(Tm3Sprite, position.vz),
    SNAP_POD(Tm3Sprite, step.vx), SNAP_POD(Tm3Sprite, step.vy), SNAP_POD(Tm3Sprite, step.vz),
    SNAP_POD(Tm3Sprite, profile), SNAP_POD(Tm3Sprite, frame), SNAP_POD(Tm3Sprite, elapsed),
    SNAP_POD(Tm3Sprite, period), SNAP_POD(Tm3Sprite, size), { 0 } };
static const SnapshotField explosion_fields[]
    = { { SnapshotPod, 0, sizeof(Tm3Explosion), NULL }, { 0 } };
static const SnapshotField debris_fields[] = { { SnapshotPod, 0, sizeof(Tm3Debris), NULL }, { 0 } };
static const SnapshotField stage_hide_fields[] = { SNAP_POD(Tm3StageHide, group),
    SNAP_POD(Tm3StageHide, stage), SNAP_POD(Tm3StageHide, tick), { 0 } };
static const SnapshotType snapshot_types[] = { { .name = "tm3TireMark",
                                                   .size = sizeof(Tm3TireMark),
                                                   .fields = Tm3TireMarkFields,
                                                   .hash_fields = 1 },
    { .name = "tm3WheelSurface",
        .size = sizeof(Tm3WheelSurface),
        .fields = Tm3WheelSurfaceFields,
        .hash_fields = 1 },
    { .name = "tm3SurfaceParticle",
        .size = sizeof(Tm3SurfaceParticle),
        .fields = Tm3SurfaceParticleFields,
        .hash_fields = 1 },
    { .name = "tm3StageHide",
        .size = sizeof(Tm3StageHide),
        .fields = stage_hide_fields,
        .hash_fields = 1 },
    { .name = "tm3Transition",
        .size = sizeof(Tm3Transition),
        .fields = Tm3TransitionFields,
        .hash_fields = 1 },
    { .name = "tm3OutlawEmitter",
        .size = sizeof(OutlawEmitter),
        .fields = Tm3EmitterFields,
        .hash_fields = 1 },
    { .name = "tm3OutlawBolt",
        .size = sizeof(OutlawBolt),
        .fields = Tm3BoltFields,
        .hash_fields = 1 },
    { .name = "tm3Remote", .size = sizeof(Tm3Remote), .fields = Tm3RemoteFields, .hash_fields = 1 },
    { .name = "tm3Prop",
        .size = sizeof(Tm3Prop),
        .fields = Tm3PropFields,
        .needs_template = 1,
        .baseline_removable = 1,
        .hash_fields = 1 },
    { .name = "tm3Decoration",
        .size = sizeof(Tm3Decoration),
        .fields = Tm3DecorationFields,
        .needs_template = 1,
        .hash_fields = 1 },
    { .name = "tm3Flamer", .size = sizeof(Emitter), .fields = emitter_fields, .hash_fields = 1 },
    { .name = "tm3Flame", .size = sizeof(Flame), .fields = flame_fields, .hash_fields = 1 },
    { .name = "tm3Burn", .size = sizeof(Burn), .fields = burn_fields, .hash_fields = 1 },
    { .name = "tm3GroundFire", .size = sizeof(Burn), .fields = burn_fields, .hash_fields = 1 },
    { .name = "tm3MapBeam",
        .size = sizeof(Tm3MapBeam),
        .fields = Tm3MapBeamFields,
        .hash_fields = 1 },
    { .name = "tm3RainDrop",
        .size = sizeof(Tm3RainDrop),
        .fields = Tm3RainDropFields,
        .hash_fields = 1 },
    { .name = "tm3Missile",
        .size = sizeof(Tm3Missile),
        .fields = Tm3MissileFields,
        .hash_fields = 1 },
    { .name = "tm3Debris", .size = sizeof(Tm3Debris), .fields = debris_fields, .hash_fields = 1 },
    { .name = "tm3Sprite", .size = sizeof(Tm3Sprite), .fields = sprite_fields, .hash_fields = 1 },
    { .name = "tm3Explosion",
        .size = sizeof(Tm3Explosion),
        .fields = explosion_fields,
        .hash_fields = 1 },
    { 0 } };
const SnapshotType* Tm3SnapshotTypes(void)
{
    return snapshot_types;
}
